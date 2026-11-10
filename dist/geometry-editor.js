/* Editor visual de zonas para hot area y drag & drop sobre imagen. */
(function(root){
 'use strict';
 const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const clone = value => JSON.parse(JSON.stringify(value));
 const HANDLES = ['nw','n','ne','e','se','s','sw','w'];

 function mount(host, options) {
  if (!host) return null;
  options = options || {};
  const geometry = root.ExamGeometry;
  const assets = root.ExamAssets;
  if (!geometry) {
   host.innerHTML = '<p class="notice">No se ha podido cargar el editor de geometría. Recarga la página.</p>';
   return null;
  }
  const type = options.type;
  const state = {
   image: options.image ? clone(options.image) : null,
   areas: (options.areas || []).map(item => ({...item})),
   items: (options.items || []).map(item => ({...item, rect:item.rect ? {...item.rect} : null})),
   targets: (options.targets || []).map(item => ({...item})),
   correct: Array.isArray(options.correct) ? clone(options.correct) : [],
   selected: null,
   mode: 'target'
  };
  if (type === 'imagedrag') {
   while (state.correct.length < state.targets.length) state.correct.push(null);
   state.correct = state.correct.slice(0, state.targets.length);
  }
  const status = {text:'', error:false};
  const history = [];
  let busy = false;

  const isHot = () => type === 'hotarea';
  const bounds = () => state.image && Number.isFinite(state.image.width) && Number.isFinite(state.image.height)
   ? {width:state.image.width, height:state.image.height} : null;

  function getValue() {
   return {
    image:state.image ? clone(state.image) : null,
    areas:clone(state.areas), items:clone(state.items), targets:clone(state.targets),
    correct:clone(state.correct)
   };
  }
  function emit() {
   if (typeof options.onChange === 'function') options.onChange(getValue());
  }
  function snapshot() {
   return JSON.stringify(getValue());
  }
  function checkpoint(before) {
   if (before === undefined || before === snapshot()) return false;
   history.push(before);
   if (history.length > 60) history.shift();
   return true;
  }
  function remember() {
   history.push(snapshot());
   if (history.length > 60) history.shift();
  }
  function restore(value) {
   const previous = state.selected;
   const data = JSON.parse(value);
   state.image = data.image;
   state.areas = data.areas;
   state.items = data.items;
   state.targets = data.targets;
   state.correct = data.correct;
   const list = previous && (previous.kind === 'area' ? state.areas : previous.kind === 'target' ? state.targets : state.items);
   state.selected = list && list.some(item => item.id === previous.id) ? previous : null;
   emit();
   render();
  }
  function undo() {
   const value = history.pop();
   if (!value) { setStatus('No hay cambios que deshacer.', true); return; }
   restore(value);
   setStatus('Cambio deshecho.');
  }
  function setStatus(text, error) {
   status.text = text || '';
   status.error = !!error;
   const el = host.querySelector('[data-geo-status]');
   if (el) { el.className = 'geometry-status' + (status.error ? ' error' : ''); el.textContent = status.text; }
   if (status.error && typeof options.onError === 'function') options.onError(status.text);
  }
  function imageSrc(image) {
   if (!image) return '';
   if (typeof image.src === 'string' && image.src) return image.src;
   if (assets && image.key && image.mime) return assets.assetSrc(image.key, image.mime);
   return assets ? assets.imageSrc(image) : '';
  }
  function selected(kind, id) { return !!state.selected && state.selected.kind === kind && state.selected.id === id; }
  function getRect(kind, id) {
   const list = kind === 'area' ? state.areas : kind === 'target' ? state.targets : state.items;
   const item = list.find(entry => entry.id === id);
   if (!item) return null;
   return kind === 'item' ? item.rect : item;
  }
  function setRect(kind, id, rect) {
   const list = kind === 'area' ? state.areas : kind === 'target' ? state.targets : state.items;
   const item = list.find(entry => entry.id === id);
   if (!item) return;
   if (kind === 'item') item.rect = rect;
   else { item.x = rect.x; item.y = rect.y; item.width = rect.width; item.height = rect.height; }
  }
  function nextId(kind) {
   const list = kind === 'area' ? state.areas : kind === 'target' ? state.targets : state.items;
   return list.reduce((max, item) => Math.max(max, Number.isInteger(item.id) ? item.id : -1), -1) + 1;
  }
  function defaultRect(kind) {
   const size = bounds();
   const width = Math.max(24, Math.round(size.width * (kind === 'item' ? 0.28 : 0.2)));
   const height = Math.max(16, Math.round(size.height * (kind === 'item' ? 0.09 : 0.1)));
   return {x:Math.round((size.width - width) / 2), y:Math.round((size.height - height) / 2), width, height};
  }
  function positionOf(kind, id) {
   const list = kind === 'area' ? state.areas : kind === 'target' ? state.targets : state.items;
   const index = list.findIndex(entry => entry.id === id);
   return index >= 0 ? index + 1 : id + 1;
  }
  function label(kind, id) {
   const number = positionOf(kind, id);
   return kind === 'item' ? 'I' + number : kind === 'target' ? 'D' + number : String(number);
  }
  function styleFor(rect) {
   const p = geometry.percent(rect, bounds());
   return `left:${p.left};top:${p.top};width:${p.width};height:${p.height}`;
  }
  function applyStyle(element, rect) {
   if (element) element.setAttribute('style', styleFor(rect));
  }
  function handles() {
   return HANDLES.map(handle => `<span class="geometry-handle ${handle}" data-handle="${handle}" aria-hidden="true"></span>`).join('');
  }
  function zoneText(kind, item) {
   const base = label(kind, item.id);
   if (kind !== 'target') return base;
   const index = state.targets.findIndex(target => target.id === item.id);
   const assigned = index >= 0 ? state.correct[index] : null;
   return assigned === null || assigned === undefined ? `${base} · sin asignar` : `${base} · ${label('item', assigned)}`;
  }
  function zone(kind, item) {
   const rect = kind === 'item' ? item.rect : item;
   if (!rect || !geometry.validRect(rect)) return '';
   const isSelected = selected(kind, item.id);
   const correct = kind === 'area' && state.correct.includes(item.id);
   const classes = ['geometry-zone', kind, isSelected ? 'selected' : '', correct ? 'correct' : ''].filter(Boolean).join(' ');
   return `<div class="${classes}" data-zone-kind="${kind}" data-zone-id="${item.id}" style="${styleFor(rect)}" role="button" tabindex="0" aria-label="${kind === 'area' ? 'Zona' : kind === 'target' ? 'Destino' : 'Recorte'} ${positionOf(kind, item.id)}"><span class="geometry-zone-label">${esc(zoneText(kind, item))}</span>${isSelected && kind !== 'target' ? handles() : ''}${isSelected && kind === 'target' && state.mode === 'target' ? handles() : ''}</div>`;
  }
  function thumb(item) {
   const src = imageSrc(item.image);
   return src ? `<img class="geometry-thumb" src="${esc(src)}" alt="Miniatura del ítem ${positionOf('item', item.id)}" loading="lazy">` : '<span class="geometry-thumb empty">Sin miniatura</span>';
  }
  function propsBar() {
   if (!state.selected) return '<div class="geometry-props"><span class="geometry-props-empty">Selecciona una zona para ver y escribir sus coordenadas exactas.</span></div>';
   const {kind, id} = state.selected;
   const rect = getRect(kind, id);
   if (!rect) return '';
   const field = (name, text) => `<label>${text}<input type="number" step="1" data-geo-prop="${name}" value="${Math.round(rect[name])}"></label>`;
   return `<div class="geometry-props" data-geo-props><strong>${esc(label(kind, id))}</strong>${field('x','X')}${field('y','Y')}${field('width','Ancho')}${field('height','Alto')}<span class="geometry-props-note">px de la imagen</span></div>`;
  }
  function syncProps(rect) {
   if (!rect) return;
   for (const name of ['x','y','width','height']) {
    const input = host.querySelector(`[data-geo-prop="${name}"]`);
    if (input && document.activeElement !== input) input.value = Math.round(rect[name]);
   }
  }
  function side() {
   if (isHot()) {
    return `<aside class="geometry-side"><h3>Zonas (${state.areas.length})</h3><p>Marca las que forman la respuesta correcta.</p><ul class="geometry-list">${state.areas.map((area, index) => `<li class="${state.correct.includes(area.id) ? 'correct' : ''} ${selected('area', area.id) ? 'selected' : ''}"><button type="button" class="geometry-select" data-geo-select="area" data-id="${area.id}">Zona ${index + 1}</button><label class="geometry-check"><input type="checkbox" data-geo-correct="${area.id}" ${state.correct.includes(area.id) ? 'checked' : ''}> Correcta</label><button type="button" class="text-delete" data-geo-delete="area" data-id="${area.id}" aria-label="Eliminar zona ${index + 1}">×</button></li>`).join('') || '<li class="geometry-empty-row">Añade una zona o arrastra sobre la imagen.</li>'}</ul></aside>`;
   }
   return `<aside class="geometry-side">
    <h3>Destinos (${state.targets.length})</h3>
    <p>Cada destino se asigna a un ítem arrastrable. El número del destino y del ítem se mantiene alineado con la imagen.</p>
    <ul class="geometry-list">${state.targets.map((target, index) => `<li class="${selected('target', target.id) ? 'selected' : ''}"><button type="button" class="geometry-select" data-geo-select="target" data-id="${target.id}">Destino ${index + 1}</button><select data-geo-assign="${index}" aria-label="Ítem del destino ${index + 1}">${['<option value="">Sin asignar</option>'].concat(state.items.map((item, itemIndex) => `<option value="${item.id}" ${String(state.correct[index]) === String(item.id) ? 'selected' : ''}>Ítem ${itemIndex + 1}</option>`)).join('')}</select></li>`).join('') || '<li class="geometry-empty-row">Añade un destino o arrastra sobre la imagen.</li>'}</ul>
    <h3>Ítems arrastrables (${state.items.length})</h3>
    <p>Sus recortes salen de la misma imagen. Puedes moverlos y redimensionarlos en el modo <b>Recortes</b>.</p>
    <ul class="geometry-items">${state.items.map((item, index) => `<li class="${selected('item', item.id) ? 'selected' : ''}">${thumb(item)}<div><strong>Ítem ${index + 1}</strong><small>${item.rect ? `${Math.round(item.rect.x)}, ${Math.round(item.rect.y)} · ${Math.round(item.rect.width)}×${Math.round(item.rect.height)}` : 'Sin recorte'}</small></div><div class="geometry-item-actions"><button type="button" class="secondary" data-geo-select="item" data-id="${item.id}">Recorte</button><button type="button" class="secondary" data-geo-regen="${item.id}">Regenerar</button><label class="secondary geometry-file">Imagen<input type="file" accept="image/jpeg,image/png,image/gif,image/bmp,image/webp" data-geo-file="item-image" data-item="${item.id}" hidden></label><button type="button" class="text-delete" data-geo-delete="item" data-id="${item.id}" aria-label="Eliminar ítem ${index + 1}">×</button></div></li>`).join('') || '<li class="geometry-empty-row">Añade un ítem para crear su recorte.</li>'}</ul>
   </aside>`;
  }
  function render() {
   const size = bounds();
   if (!state.image || !size || size.width <= 0 || size.height <= 0) {
    host.innerHTML = `<div class="geometry-empty"><p><strong>Selecciona la imagen de la interacción.</strong></p><p>Las zonas se dibujan sobre la imagen y se guardan con sus coordenadas.</p><label class="primary geometry-file">Elegir imagen<input type="file" accept="image/jpeg,image/png,image/gif,image/bmp,image/webp" data-geo-file="image" hidden></label><div class="geometry-status ${status.error ? 'error' : ''}" data-geo-status>${esc(status.text)}</div></div>`;
    return;
   }
   host.innerHTML = `<div class="geometry-editor mode-${state.mode}">
    <div class="geometry-toolbar">
     <button type="button" class="secondary" data-geo-action="add">${isHot() ? '+ Añadir zona' : '+ Añadir destino'}</button>
     ${isHot() ? '<button type="button" class="secondary" data-geo-action="correct">Marcar / desmarcar correcta</button>' : `<button type="button" class="secondary" data-geo-action="add-item">+ Añadir ítem</button><label class="geometry-mode">Editar<select data-geo-mode><option value="target" ${state.mode === 'target' ? 'selected' : ''}>Destinos</option><option value="item" ${state.mode === 'item' ? 'selected' : ''}>Recortes de ítems</option></select></label>`}
     <button type="button" class="secondary" data-geo-action="delete" ${state.selected ? '' : 'disabled'}>Eliminar seleccionado</button>
     <button type="button" class="secondary" data-geo-action="undo" ${history.length ? '' : 'disabled'}>Deshacer</button>
     <label class="secondary geometry-file">Cambiar imagen<input type="file" accept="image/jpeg,image/png,image/gif,image/bmp,image/webp" data-geo-file="image" hidden></label>
     <span class="geometry-size">${size.width} × ${size.height} px</span>
    </div>
     <p class="geometry-help">${isHot() ? 'Arrastra sobre la imagen para dibujar una zona. Mueve desde el interior y usa los tiradores para ajustar.' : state.mode === 'target' ? 'Los destinos verdes se dibujan sobre la imagen. Asigna cada uno a un ítem en la lista.' : 'Arrastra los recortes azules para ajustar de dónde se extrae cada ítem. Después pulsa Regenerar.'}</p>
     ${propsBar()}
    <div class="geometry-workspace">
     <div class="geometry-board" data-geo-board style="aspect-ratio:${size.width}/${size.height}">
      <img src="${esc(imageSrc(state.image))}" alt="Imagen de la interacción" draggable="false">
      ${state.areas.map(item => zone('area', item)).join('')}
      ${state.targets.map(item => zone('target', item)).join('')}
      ${state.items.map(item => zone('item', item)).join('')}
     </div>
     ${side()}
    </div>
    <div class="geometry-status ${status.error ? 'error' : ''}" data-geo-status>${esc(status.text)}</div>
   </div>`;
  }

  // Convierte una posición del puntero a píxeles de la imagen. Se usa el
  // rectángulo real del lienzo para que el arrastre sea siempre 1:1 con el
  // movimiento del ratón, incluso si la imagen se muestra reducida.
  function point(event, board) {
   const rect = board.getBoundingClientRect();
   return {
    x:(event.clientX - rect.left) * state.image.width / rect.width,
    y:(event.clientY - rect.top) * state.image.height / rect.height
   };
  }
  function scaleFor(board) {
   const rect = board.getBoundingClientRect();
   return {
    rect,
    x:state.image.width / Math.max(1, rect.width),
    y:state.image.height / Math.max(1, rect.height)
   };
  }
  function listen(move, up) {
   const onMove = event => { event.preventDefault(); move(event); };
   const onUp = event => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    document.body.classList.remove('geometry-dragging');
    up(event);
   };
   document.addEventListener('pointermove', onMove);
   document.addEventListener('pointerup', onUp);
   document.addEventListener('pointercancel', onUp);
   document.body.classList.add('geometry-dragging');
  }
  function dragRect(event, kind, id, handle) {
   const board = host.querySelector('[data-geo-board]');
   const original = getRect(kind, id);
   if (!board || !original) return;
   const element = host.querySelector(`[data-zone-kind="${kind}"][data-zone-id="${id}"]`);
   const size = bounds();
   if (!element) return;
   const before = snapshot();
   const scale = scaleFor(board);
   // Guardamos el puntero y la escala inicial. Los deltas se calculan siempre
   // desde ese punto fijo, sin volver a leer el layout en cada movimiento: así
   // una zona pequeña no se dispara si el navegador desplaza o repinta.
   const startX = event.clientX, startY = event.clientY;
   listen(moveEvent => {
    const dx = (moveEvent.clientX - startX) * scale.x;
    const dy = (moveEvent.clientY - startY) * scale.y;
    const rect = handle ? geometry.resizeRect(original, handle, dx, dy, size) : geometry.moveRect(original, dx, dy, size);
    setRect(kind, id, rect);
    applyStyle(element, rect);
    syncProps(rect);
    setStatus(`${handle ? 'Ajustando' : 'Moviendo'} ${kind === 'item' ? 'recorte' : kind === 'target' ? 'destino' : 'zona'} ${positionOf(kind, id)}: ${Math.round(rect.x)}, ${Math.round(rect.y)} · ${Math.round(rect.width)}×${Math.round(rect.height)} px`);
   }, () => {
    setRect(kind, id, geometry.clampRect(geometry.roundRect(getRect(kind, id)), size));
    checkpoint(before);
    emit();
    render();
   });
  }
  async function regenerate(item) {
   if (!assets) { setStatus('El módulo de imágenes no está disponible.', true); return; }
   if (!item || !item.rect) { setStatus('El ítem no tiene un recorte definido.', true); return; }
   busy = true;
   try {
    setStatus('Generando la miniatura del ítem…');
    const crop = await assets.cropImage(imageSrc(state.image), item.rect);
    const uploaded = await assets.uploadBytes(crop.bytes, crop.mime, null, {width:crop.width, height:crop.height});
    remember();
    item.image = {key:uploaded.key, src:uploaded.src, mime:uploaded.mime, width:crop.width, height:crop.height};
    emit();
    setStatus('Miniatura regenerada.');
   } catch (error) {
    setStatus(error.message || 'No se ha podido generar la miniatura.', true);
   } finally {
    busy = false;
    render();
   }
  }
  async function replaceImage(file) {
   if (!file) return;
   if (!assets) { setStatus('El módulo de imágenes no está disponible.', true); return; }
   busy = true;
   try {
    setStatus('Subiendo la imagen…');
    const info = await assets.readFile(file);
    const uploaded = await assets.uploadBytes(info.bytes, info.mime, null, {width:info.width, height:info.height});
    const previous = bounds() || {width:info.width, height:info.height};
    const next = {width:info.width, height:info.height};
    remember();
    state.image = {key:uploaded.key, src:uploaded.src, mime:uploaded.mime, width:info.width, height:info.height};
    for (const area of state.areas) Object.assign(area, geometry.roundRect(geometry.scaleRect(area, previous, next)));
    for (const target of state.targets) Object.assign(target, geometry.roundRect(geometry.scaleRect(target, previous, next)));
    for (const item of state.items) if (item.rect) item.rect = geometry.roundRect(geometry.scaleRect(item.rect, previous, next));
    if (!isHot()) {
     setStatus('Actualizando las miniaturas de los ítems…');
     for (const item of state.items) {
      if (!item.rect) continue;
      try {
       const crop = await assets.cropImage(uploaded.src, item.rect);
       const thumb = await assets.uploadBytes(crop.bytes, crop.mime, null, {width:crop.width, height:crop.height});
       item.image = {key:thumb.key, src:thumb.src, mime:thumb.mime, width:crop.width, height:crop.height};
      } catch { item.image = null; }
     }
    }
    emit();
    setStatus('Imagen actualizada. Revisa las zonas.');
   } catch (error) {
    setStatus(error.message || 'No se ha podido cambiar la imagen.', true);
   } finally {
    busy = false;
    render();
   }
  }
  async function replaceItemImage(item, file) {
   if (!file || !item) return;
   if (!assets) { setStatus('El módulo de imágenes no está disponible.', true); return; }
   busy = true;
   try {
    const uploaded = await assets.uploadFile(file);
    remember();
    item.image = uploaded;
    emit();
    setStatus('Miniatura del ítem actualizada.');
   } catch (error) {
    setStatus(error.message || 'No se ha podido subir la imagen del ítem.', true);
   } finally {
    busy = false;
    render();
   }
  }
  function selectedObject() {
   if (!state.selected) return null;
   const list = state.selected.kind === 'area' ? state.areas : state.selected.kind === 'target' ? state.targets : state.items;
   return list.find(item => item.id === state.selected.id) || null;
  }
  function deleteItem(kind, id) {
   remember();
   if (kind === 'area') {
    state.areas = state.areas.filter(item => item.id !== id);
    state.correct = state.correct.filter(value => value !== id);
   } else if (kind === 'target') {
    const index = state.targets.findIndex(item => item.id === id);
    if (index < 0) return;
    state.targets.splice(index, 1);
    state.correct.splice(index, 1);
   } else {
    state.items = state.items.filter(item => item.id !== id);
    state.correct = state.correct.map(value => value === id ? null : value);
   }
   if (state.selected && state.selected.kind === kind && state.selected.id === id) state.selected = null;
   emit();
   render();
  }

  host.addEventListener('click', async event => {
   if (busy) return;
   const select = event.target.closest('[data-geo-select]');
   if (select) {
    state.selected = {kind:select.dataset.geoSelect, id:Number(select.dataset.id)};
    if (select.dataset.geoSelect === 'item') state.mode = 'item';
    render();
    return;
   }
   const remove = event.target.closest('[data-geo-delete]');
   if (remove) { deleteItem(remove.dataset.geoDelete, Number(remove.dataset.id)); return; }
   const regen = event.target.closest('[data-geo-regen]');
   if (regen) { const item = state.items.find(entry => entry.id === Number(regen.dataset.geoRegen)); await regenerate(item); return; }
   const action = event.target.closest('[data-geo-action]');
   if (!action) return;
   const name = action.dataset.geoAction;
   if (name === 'add' || name === 'add-item') {
    const kind = name === 'add-item' ? 'item' : isHot() ? 'area' : 'target';
    remember();
    const item = kind === 'item' ? {id:nextId('item'), rect:defaultRect('item'), image:null} : {id:nextId(kind), ...defaultRect(kind)};
    if (kind === 'area') state.areas.push(item);
    else if (kind === 'target') { state.targets.push(item); state.correct.push(null); }
    else state.items.push(item);
    state.selected = {kind, id:item.id};
    if (kind === 'item') state.mode = 'item';
    emit(); render();
   } else if (name === 'delete') {
    if (state.selected) deleteItem(state.selected.kind, state.selected.id);
   } else if (name === 'undo') {
    undo();
   } else if (name === 'correct') {
    if (!state.selected || state.selected.kind !== 'area') { setStatus('Selecciona una zona para marcarla como correcta.', true); return; }
    remember();
    const id = state.selected.id;
    state.correct = state.correct.includes(id) ? state.correct.filter(value => value !== id) : [...state.correct, id];
    emit(); render();
   }
  });

  host.addEventListener('change', async event => {
   if (event.target.matches('[data-geo-mode]')) {
    state.mode = event.target.value;
    if (state.selected && state.selected.kind === 'item' && state.mode !== 'item') state.selected = null;
    render();
    return;
   }
   if (event.target.matches('[data-geo-assign]')) {
    const index = Number(event.target.dataset.geoAssign);
    const value = event.target.value === '' ? null : Number(event.target.value);
    remember();
    state.correct[index] = value;
    emit(); render();
    return;
   }
   if (event.target.matches('[data-geo-correct]')) {
    const id = Number(event.target.dataset.geoCorrect);
    remember();
    state.correct = event.target.checked ? [...new Set([...state.correct, id])] : state.correct.filter(value => value !== id);
    emit(); render();
    return;
   }
   const file = event.target.closest('[data-geo-file]');
   if (file && file.files && file.files[0]) {
    const chosen = file.files[0];
    file.value = '';
    if (file.dataset.geoFile === 'image') await replaceImage(chosen);
    else if (file.dataset.geoFile === 'item-image') {
     const item = state.items.find(entry => entry.id === Number(file.dataset.item));
     await replaceItemImage(item, chosen);
    }
   }
  });

  let propsBefore = null;
  host.addEventListener('focusin', event => {
   if (event.target.closest('[data-geo-prop]')) propsBefore = snapshot();
  });
  host.addEventListener('input', event => {
   const input = event.target.closest('[data-geo-prop]');
   if (!input || !state.selected) return;
   const {kind, id} = state.selected;
   const rect = getRect(kind, id);
   if (!rect) return;
   const name = input.dataset.geoProp;
   let value = Number(input.value);
   if (!Number.isFinite(value)) return;
   if (name === 'width' || name === 'height') value = Math.max(geometry.MIN, value);
   const next = {...rect, [name]:value};
   setRect(kind, id, next);
   applyStyle(host.querySelector(`[data-zone-kind="${kind}"][data-zone-id="${id}"]`), next);
   emit();
  });
  host.addEventListener('change', event => {
   const input = event.target.closest('[data-geo-prop]');
   if (!input || !state.selected) return;
   const {kind, id} = state.selected;
   const rect = getRect(kind, id);
   if (!rect) return;
   setRect(kind, id, geometry.clampRect(geometry.roundRect(rect), bounds()));
   checkpoint(propsBefore);
   propsBefore = null;
   emit();
   render();
  });

  host.addEventListener('pointerdown', event => {
   if (busy || !bounds()) return;
   if (event.target.closest('input,select,button,label')) return;
   const board = event.target.closest('[data-geo-board]');
   if (!board) return;
   const handle = event.target.closest('[data-handle]');
   const zoneElement = event.target.closest('[data-zone-kind]');
   if (handle && zoneElement) {
    event.preventDefault();
    const kind = zoneElement.dataset.zoneKind, id = Number(zoneElement.dataset.zoneId);
    state.selected = {kind, id};
    dragRect(event, kind, id, handle.dataset.handle);
    return;
   }
   if (zoneElement) {
    event.preventDefault();
    const kind = zoneElement.dataset.zoneKind, id = Number(zoneElement.dataset.zoneId);
    if (kind === 'item' && state.mode !== 'item') return;
    if (kind === 'target' && state.mode !== 'target') return;
    state.selected = {kind, id};
    dragRect(event, kind, id, null);
    return;
   }
   if (event.target !== board && event.target.tagName !== 'IMG') return;
   event.preventDefault();
   const kind = isHot() ? 'area' : state.mode === 'item' ? 'item' : 'target';
   const start = point(event, board);
   const scale = scaleFor(board);
   const startX = event.clientX, startY = event.clientY;
   const before = snapshot();
   const rect = geometry.normalizeRect(start, start, bounds());
   const id = nextId(kind);
   const temp = document.createElement('div');
   temp.className = 'geometry-zone ' + kind + ' selected';
   temp.dataset.zoneKind = kind;
   temp.dataset.zoneId = String(id);
   temp.innerHTML = `<span class="geometry-zone-label">${esc(label(kind, id))}</span>`;
   temp.setAttribute('style', styleFor(rect));
   board.appendChild(temp);
   listen(moveEvent => {
    const nextPoint = {
     x:start.x + (moveEvent.clientX - startX) * scale.x,
     y:start.y + (moveEvent.clientY - startY) * scale.y
    };
    const next = geometry.normalizeRect(start, nextPoint, bounds());
    Object.assign(rect, next);
    applyStyle(temp, rect);
    setStatus(`Dibujando ${kind === 'item' ? 'recorte' : kind === 'target' ? 'destino' : 'zona'}: ${Math.round(rect.width)}×${Math.round(rect.height)} px`);
   }, () => {
    temp.remove();
    if (rect.width < geometry.MIN || rect.height < geometry.MIN) return;
    const rounded = geometry.roundRect(geometry.clampRect(rect, bounds()));
    const item = kind === 'item' ? {id, rect:rounded, image:null} : {id, ...rounded};
    if (kind === 'area') state.areas.push(item);
    else if (kind === 'target') { state.targets.push(item); state.correct.push(null); }
    else state.items.push(item);
    state.selected = {kind, id};
    if (kind === 'item') state.mode = 'item';
    checkpoint(before);
    emit(); render();
   });
  });

  host.addEventListener('keydown', event => {
   if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && !event.target.closest('input,textarea,select')) {
    event.preventDefault();
    undo();
    return;
   }
   if (state.selected && !event.target.closest('input,textarea,select')) {
    const steps = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    const step = steps[event.key];
    if (step) {
     event.preventDefault();
     const kind = state.selected.kind, id = state.selected.id;
     const rect = getRect(kind, id);
     if (!rect) return;
     const amount = event.shiftKey ? 10 : 1;
     setRect(kind, id, geometry.roundRect(geometry.moveRect(rect, step[0] * amount, step[1] * amount, bounds())));
     emit();
     render();
     requestAnimationFrame(() => host.querySelector(`[data-zone-kind="${kind}"][data-zone-id="${id}"]`)?.focus());
     return;
    }
   }
   if ((event.key === 'Delete' || event.key === 'Backspace') && state.selected && !event.target.closest('input,textarea,select')) {
    event.preventDefault();
    deleteItem(state.selected.kind, state.selected.id);
   }
  });

  render();
  return {getValue, refresh:render};
 }
 root.ExamGeometryEditor = {mount};
 if (typeof module !== 'undefined' && module.exports) module.exports = {mount};
})(globalThis);
