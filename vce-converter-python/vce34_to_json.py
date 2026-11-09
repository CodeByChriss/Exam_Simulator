#!/usr/bin/env python3
"""Convierte ficheros .vce versión 3.4 (cabecera 85 A8 03 04) a JSON.

Uso:
    python vce34_to_json.py examen.vce [salida.json] [--images-dir carpeta] [--debug]

Tipos de pregunta: elección simple/múltiple (con o sin caso de estudio),
Select and Place (drag and drop) y Hot Area. Las imágenes (la del área y las
incrustadas en enunciado, caso de estudio, opciones o explicación) se registran
por SHA-256 y el JSON contiene descriptores {key, mime, width, height}; no se
incluye base64. Con --images-dir se escriben además los ficheros <sha256>.<ext>.

Cifrado reconstruido a partir de ficheros de prueba:
    dec = enc ^ s ;  s_nuevo = idx & ((s + (enc | dec)) & 255)
"""
import hashlib, json, os, re, struct, sys

try:
    from PIL import Image
    import io
except Exception:                                   # Pillow es opcional
    Image = None

# ───────────────────────── lectura binaria + cifrado ─────────────────────────
class Reader:
    def __init__(self, data):
        self.d, self.pos = data, 0

    def take(self, n):
        if n < 0 or self.pos + n > len(self.d):
            raise ValueError(f"lectura fuera de rango en 0x{self.pos:X} (n={n})")
        b = self.d[self.pos:self.pos + n]
        self.pos += n
        return b

    def u8(self): return self.take(1)[0]
    def i32(self): return struct.unpack('<i', self.take(4))[0]

    def array(self, decrypt=True):
        s = 0
        self.take(1)                                  # marcador
        n_bytes = bytearray()
        for idx in range(1, 5):
            enc = self.u8(); dec = enc ^ s
            s = idx & ((s + (enc | dec)) & 255)
            n_bytes.append(dec)
        n = struct.unpack('<i', bytes(n_bytes))[0]
        raw = self.take(n)
        if not decrypt:
            return bytes(raw)
        out = bytearray()
        for i, enc in enumerate(raw):
            idx = (5 + i) & 255
            dec = enc ^ s
            s = idx & ((s + (enc | dec)) & 255)
            out.append(dec)
        return bytes(out)

# ───────────────────────── texto enriquecido + imágenes ─────────────────────────
MARK = b'-8 1 3 1'
MARK_RE = re.compile(rb'-8 1 (?:3 1|2)(?=\r\n)')   # marcador nuevo y marcador legado
BLOCK, LINE = b'\r\n', b') '

FONT_TAGS = {0: ('', ''), 1: ('<b>', '</b>'), 6: ('<u>', '</u>'), 17: ('<i>', '</i>'),
             29: ('<b><u>', '</u></b>'), 39: ('<b><i>', '</i></b>'),
             40: ('<b><i><u>', '</u></i></b>'), 43: ('<i><u>', '</u></i>'),
             2: ('<span style="font-family:monospace">', '</span>'),
             5: ('<b>', '</b>'), 32: ('<span style="font-size:large">', '</span>'),
             30: ('<span style="font-size:small">', '</span>')}
LINE_TAGS = {11: ('<div style="text-align:center">', '</div>'),
             17: ('<div style="text-align:right">', '</div>'),
             18: ('<div style="text-align:justify">', '</div>')}
FORMAT_RE = re.compile(rb'^-?\d+( -?\d+){5,9}( ".*")?$')
IMG_CLASSES = (b'TJPEGImage', b'TPngImage', b'TBitmap', b'TGIFImage', b'TWICImage')
SIGS = ((b'\xff\xd8\xff', 'image/jpeg'), (b'\x89PNG\r\n\x1a\n', 'image/png'),
        (b'GIF8', 'image/gif'), (b'BM', 'image/bmp'))
IMAGE_EXT = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
             'image/bmp': 'bmp', 'image/webp': 'webp'}
IMAGE_REGISTRY = {}          # sha256 -> {'mime','width','height','data'}


def mime_of(data):
    for sig, m in SIGS:
        if data.startswith(sig):
            return m
    return 'application/octet-stream'


def image_size(data):
    if data.startswith(b'\x89PNG') and len(data) >= 24:
        return struct.unpack('>II', data[16:24])
    if data.startswith((b'GIF87a', b'GIF89a')) and len(data) >= 10:
        return struct.unpack('<HH', data[6:10])
    if data.startswith(b'BM') and len(data) >= 26:
        return struct.unpack('<ii', data[18:26])
    if data.startswith(b'\xff\xd8'):
        pos = 2
        while pos + 9 < len(data):
            if data[pos] != 0xff:
                pos += 1
                continue
            while pos < len(data) and data[pos] == 0xff:
                pos += 1
            marker = data[pos]; pos += 1
            if marker in (0xd8, 0xd9):
                continue
            if pos + 2 > len(data):
                break
            length = struct.unpack('>H', data[pos:pos + 2])[0]
            if marker in range(0xc0, 0xc4) and pos + 7 <= len(data):
                height, width = struct.unpack('>HH', data[pos + 3:pos + 7])
                return width, height
            if length < 2:
                break
            pos += length
    return None


def make_image(data, **extra):
    """Registra la imagen por SHA-256 y devuelve solo su descriptor."""
    key = hashlib.sha256(data).hexdigest()
    mime = mime_of(data)
    info = {'mime': mime, 'width': None, 'height': None, 'data': data}
    if Image is not None:
        try:
            im = Image.open(io.BytesIO(data)); info['width'], info['height'] = im.size
        except Exception:
            pass
    if info['width'] is None:
        size = image_size(data)
        if size:
            info['width'], info['height'] = size
    IMAGE_REGISTRY[key] = info
    img = {'key': key, 'mime': mime}
    if info['width']:
        img['width'] = info['width']
    if info['height']:
        img['height'] = info['height']
    img.update(extra)
    return img


def pop_token(data, pos):
    """Equivalente al Separator del proyecto original: devuelve (token, nueva_pos)."""
    for i in range(pos, len(data)):
        for sp in (BLOCK, LINE):
            if data.startswith(sp, i):
                if i == pos:
                    return sp, pos + len(sp)
                return data[pos:i], i
    return data[pos:], len(data)


def decode_text(raw, unicode_):
    if unicode_ or b'\x00' in raw:
        return raw.decode('utf-16le', 'ignore').replace('\x00', '')
    return ''.join(chr(b) for b in raw if b >= 0x20 and not 0x7f <= b <= 0x9f) \
        if False else raw.decode('cp1252', 'ignore')


def clean(s):
    return ''.join(c for c in s if c >= ' ' or c in '\n\t')


def find_inline_image(data, start):
    """Localiza la imagen que sigue a un nombre de clase (TJPEGImage...)."""
    best = None
    for sig, _ in SIGS:
        p = data.find(sig, start, start + 400)
        if p >= 0 and (best is None or p < best):
            best = p
    if best is None:
        return None, start
    if best >= 4:
        n = struct.unpack_from('<i', data, best - 4)[0]
        if 0 < n <= len(data) - best:
            return data[best:best + n], best + n
    # sin longitud fiable: usar marcadores de fin
    if data.startswith(b'\xff\xd8', best):
        e = data.find(b'\xff\xd9', best)
        if e >= 0:
            return data[best:e + 2], e + 2
    if data.startswith(b'\x89PNG', best):
        e = data.find(b'IEND', best)
        if e >= 0:
            return data[best:e + 8], e + 8
    return None, start


def parse_rich(section):
    """Una sección de texto enriquecido -> {'text','html','images'}."""
    images, used = [], []
    text_parts, html_parts = [], []
    pos, pending, unicode_ = 0, b'', False
    line_end = font_end = ''
    while pos < len(section):
        tok, pos = pop_token(section, pos)
        if tok == LINE:
            t = clean(decode_text(pending, unicode_))
            text_parts.append(t + '\n'); html_parts.append(t.replace('<', '&lt;') + '<br>')
            pending = b''
        elif tok == BLOCK:
            f = pending; pending = b''
            if FORMAT_RE.match(f.strip()):
                nums = f.strip().split(b' ')
                if len(nums) == 6 or (len(nums) > 6 and nums[5].startswith(b'"')):
                    unicode_ = (int(nums[3]) & 8) != 0
                    html_parts.append(line_end)
                    ls, line_end = LINE_TAGS.get(int(nums[2]), ('', ''))
                    html_parts.append(ls + font_end)
                    fs, font_end = FONT_TAGS.get(int(nums[0]), ('', ''))
                    html_parts.append(fs)
                elif len(nums) == 10:
                    text_parts.append('• ')
        else:
            if any(c in tok for c in IMG_CLASSES):
                data, end = find_inline_image(section, pos - len(tok))
                if data:
                    n = len(images)
                    images.append(make_image(data, index=n))
                    used.append((section.find(data), len(data)))
                    text_parts.append(f'{{{{image:{n}}}}}\n'); html_parts.append(f'{{{{image:{n}}}}}')
                    pos = end; pending = b''
                    continue
            pending = tok
    # lo que quede sin terminar en ') ' es la cabecera (5 bytes) del bloque siguiente: se descarta
    # red de seguridad: imágenes presentes en el texto que no se hayan detectado antes
    for sig, _ in SIGS[:3]:
        for m in re.finditer(re.escape(sig), section):
            p = m.start()
            if any(a <= p < a + l for a, l in used):
                continue
            data, _e = find_inline_image(section, max(0, p - 4))
            if data and data.startswith(sig):
                n = len(images); images.append(make_image(data, index=n, unplaced=True))
                used.append((p, len(data)))
    text = ''.join(text_parts).strip('\n')
    html = ''.join(html_parts) + line_end + font_end
    return {'text': text, 'html': re.sub(r'^(<br>)+|(<br>)+$', '', html), 'images': images}


def rich_sections(blob):
    return [parse_rich(p) for p in MARK_RE.split(blob)[1:]]

# ───────────────────────── estructura del fichero ─────────────────────────
TYPE_NAMES = {0: 'single_choice', 1: 'multiple_choice', 2: 'drag_and_drop', 3: 'point_and_shoot',
              4: 'create_a_tree', 5: 'build_list_and_reorder', 6: 'drop_and_connect',
              7: 'multiple_choice', 9: 'hot_area'}
CHOICE, DND, HOT = (0, 1, 7), (2, 4, 5, 6), (3, 9)


def rect(x0, y0, x1, y1):
    return {'x': x0, 'y': y0, 'width': x1 - x0, 'height': y1 - y0}


def crop(img_bytes, r):
    if Image is None:
        return None
    try:
        im = Image.open(io.BytesIO(img_bytes)).convert('RGB')
        c = im.crop((r['x'], r['y'], r['x'] + r['width'], r['y'] + r['height']))
        buf = io.BytesIO(); c.save(buf, 'PNG')
        return make_image(buf.getvalue())
    except Exception:
        return None


def empty_rich():
    return {'text': '', 'html': '', 'images': []}


def parse_question(r, qid, debug):
    r.take(6)
    qtype = r.u8(); sec = r.i32(); cx = r.i32(); r.i32()
    q = {'id': qid, 'type': TYPE_NAMES.get(qtype, f'unknown_{qtype}'), 'rawType': qtype,
         'sectionId': sec, 'complexity': cx}
    warnings = []
    if qtype in CHOICE:
        blob = r.array(); answers = r.array().decode('latin-1')
        nvar = r.i32(); flags = r.take(3); title = r.array().decode('latin-1')
        secs = rich_sections(blob)
        case = flags[2] == 1
        expected = nvar + 2 + (1 if case else 0)
        if len(secs) != expected:
            warnings.append(f'se esperaban {expected} bloques de texto y hay {len(secs)}')
        secs += [empty_rich()] * max(0, expected - len(secs))
        q['question'] = secs[0]
        i = 1
        q['caseStudy'] = None
        if case:
            q['caseStudy'] = dict(secs[1], title=title); i = 2
        q['options'] = [dict(secs[i + k], letter=chr(65 + k), correct=chr(65 + k) in answers)
                        for k in range(nvar)]
        q['correctAnswers'] = [c for c in answers if c.isalpha()]
        q['explanation'] = secs[i + nvar] if i + nvar < len(secs) else empty_rich()
    elif qtype in DND or qtype in HOT:
        variants = r.array(); answers = r.array(); blob = r.array(); r.take(2); image = r.array()
        secs = rich_sections(blob) or [empty_rich()]
        q['question'] = secs[0]
        q['explanation'] = secs[1] if len(secs) > 1 else empty_rich()
        if len(secs) > 2:
            warnings.append(f'{len(secs)} bloques de texto (se esperaban 2); los extra se guardan en extraText')
            q['extraText'] = secs[2:]
        q['areaImage'] = make_image(image) if image else None
        n = struct.unpack_from('<i', variants)[0]
        if qtype in HOT:
            na = struct.unpack_from('<i', answers)[0]
            areas = []
            for i in range(n):
                x0, y0, x1, y1 = struct.unpack_from('<4i', variants, 4 + 16 * i)
                areas.append(dict(index=i, rect=rect(x0, y0, x1, y1),
                                  correct=bool(i < na and answers[4 + i] == 1)))
            q['hotArea'] = {'areas': areas}
            q['correctAreas'] = [a['index'] for a in areas if a['correct']]
        else:
            nums = list(struct.unpack_from(f'<{n}i', answers, 4))
            items, targets, kinds = [], [], []
            for i in range(n):
                t = variants[4 + 21 * i]
                x0, y0, x1, y1 = struct.unpack_from('<4i', variants, 4 + 21 * i + 5)
                kinds.append((t, rect(x0, y0, x1, y1)))
            drag_rank = {}                      # índice de área -> posición entre los elementos arrastrables
            for i, (t, rc) in enumerate(kinds):
                if t == 1:
                    drag_rank[i] = len(items)
                    it = {'index': len(items), 'rect': rc}
                    c = crop(image, rc) if image else None
                    if c: it['image'] = c
                    items.append(it)
            for i, (t, rc) in enumerate(kinds):
                if t == 2:
                    # la respuesta de un destino es el índice (en la lista completa de áreas)
                    # del elemento arrastrable correcto; -1 = ninguno
                    ref = nums[i]
                    if ref in drag_rank:
                        correct = drag_rank[ref]
                    else:
                        correct = None
                        if ref != -1:
                            warnings.append(f'destino {len(targets)} apunta al área {ref}, que no es arrastrable')
                    targets.append({'index': len(targets), 'rect': rc, 'correctItem': correct})
            q['dragAndDrop'] = {'items': items, 'targets': targets}
            q['correctAnswers'] = [t['correctItem'] for t in targets]
        if qtype not in (2, 9):
            warnings.append('tipo de pregunta sin verificar con ficheros reales en v34')
    else:
        raise ValueError(f'Tipo de pregunta {qtype} aún sin soporte en v34')
    if warnings:
        q['warnings'] = warnings
    return q


def parse(data, debug=False):
    IMAGE_REGISTRY.clear()
    r = Reader(data)
    if r.take(2) != b'\x85\xa8':
        raise ValueError('No es un fichero .vce')
    v1, v2 = r.u8(), r.u8()
    version = v1 * 10 + v2
    if version != 34:
        raise ValueError(f'Versión {version}: este script solo soporta la 34')
    r.u8()
    out = {'format': 'vce', 'version': version}
    out['number'] = r.array().decode('latin-1')
    out['title'] = r.array().decode('latin-1')
    out['passingScore'] = r.i32()
    out['timeLimit'] = r.i32()
    out['fileVersion'] = r.array().decode('latin-1')
    r.take(32); r.u8()
    if r.u8():
        r.array()
    r.array(decrypt=False)
    r.array()
    secs = rich_sections(r.array())
    out['description'] = secs[0] if secs else empty_rich()
    out['sections'] = []
    for _ in range(r.i32()):
        sid = r.i32()
        out['sections'].append({'id': sid, 'name': r.array().decode('latin-1')})
    out['exams'] = []
    try:
        for _ in range(r.i32()):
            etype = r.u8()
            exam = {'name': r.array().decode('latin-1'), 'questions': []}
            out['exams'].append(exam)
            if etype != 0:
                raise ValueError('Exámenes con secciones (tipo 1) aún sin soporte en v34')
            for _ in range(r.i32()):
                exam['questions'].append(parse_question(r, len(exam['questions']) + 1, debug))
    except Exception as e:
        out['error'] = f'{e} (posición 0x{r.pos:X})'
    return out


def save_images(node, folder):
    """Guarda cada imagen única del registro y añade el campo 'file'."""
    written = {}

    def walk(value):
        if isinstance(value, dict):
            key = value.get('key')
            if key and 'mime' in value and 'file' not in value and key in IMAGE_REGISTRY:
                if key not in written:
                    info = IMAGE_REGISTRY[key]
                    name = f'{key}.{IMAGE_EXT.get(info["mime"], "bin")}'
                    with open(os.path.join(folder, name), 'wb') as f:
                        f.write(info['data'])
                    written[key] = name
                value['file'] = written[key]
            for v in value.values():
                walk(v)
        elif isinstance(value, list):
            for v in value:
                walk(v)

    walk(node)


if __name__ == '__main__':
    argv = sys.argv[1:]
    img_dir = None
    if '--images-dir' in argv:
        i = argv.index('--images-dir'); img_dir = argv[i + 1]; del argv[i:i + 2]
    args = [a for a in argv if not a.startswith('--')]
    if not args:
        sys.exit(__doc__)
    src = args[0]
    dst = args[1] if len(args) > 1 else re.sub(r'\.vce$', '', src, flags=re.I) + '.json'
    res = parse(open(src, 'rb').read(), '--debug' in argv)
    if img_dir:
        os.makedirs(img_dir, exist_ok=True)
        save_images(res, img_dir)
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(res, f, ensure_ascii=False, indent=2)
    nq = sum(len(e['questions']) for e in res['exams'])
    print(f'OK -> {dst} | {nq} preguntas' + (f' | AVISO: {res["error"]}' if 'error' in res else ''))
