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
  function label(kind, id) {
   if (kind === 'item') return 'I' + (id + 1);
   if (kind === 'target') return 'D' + (id + 1);
   return String(id + 1);
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
  function zone(kind, item) {
   const rect = kind === 'item' ? item.rect : item;
   if (!rect || !geometry.validRect(rect)) return '';
   const isSelected = selected(kind, item.id);
   const correct = kind === 'area' && state.correct.includes(item.id);
   const classes = ['geometry-zone', kind, isSelected ? 'selected' : '', correct ? 'correct' : ''].filter(Boolean).join(' ');
   return `<div class="${classes}" data-zone-kind="${kind}" data-zone-id="${item.id}" style="${styleFor(rect)}" role="button" tabindex="0" aria-label="${kind === 'area' ? 'Zona' : kind === 'target' ? 'Destino' : 'Recorte'} ${item.id + 1}"><span class="geometry-zone-label">${esc(label(kind, item.id))}</span>${isSelected && kind !== 'target' ? handles() : ''}${isSelected && kind === 'target' && state.mode === 'target' ? handles() : ''}</div>`;
  }
  function thumb(item) {
   const src = imageSrc(item.image);
   return src ? `<img class="geometry-thumb" src="${esc(src)}" alt="Miniatura del ítem ${item.id + 1}" loading="lazy">` : '<span class="geometry-thumb empty">Sin miniatura</span>';
  }
  function side() {
   if (isHot()) {
    return `<aside class="geometry-side"><h3>Zonas (${state.areas.length})</h3><p>Marca las que forman la respuesta correcta.</p><ul class="geometry-list">${state.areas.map(area => `<li class="${state.correct.includes(area.id) ? 'correct' : ''} ${selected('area', area.id) ? 'selected' : ''}"><button type="button" class="geometry-select" data-geo-select="area" data-id="${area.id}">Zona ${area.id + 1}</button><label class="geometry-check"><input type="checkbox" data-geo-correct="${area.id}" ${state.correct.includes(area.id) ? 'checked' : ''}> Correcta</label><button type="button" class="text-delete" data-geo-delete="area" data-id="${area.id}" aria-label="Eliminar zona ${area.id + 1}">×</button></li>`).join('') || '<li class="geometry-empty-row">Añade una zona o arrastra sobre la imagen.</li>'}</ul></aside>`;
   }
   return `<aside class="geometry-side">
    <h3>Destinos (${state.targets.length})</h3>
    <p>Cada destino se asigna a un ítem arrastrable.</p>
    <ul class="geometry-list">${state.targets.map((target, index) => `<li class="${selected('target', target.id) ? 'selected' : ''}"><button type="button" class="geometry-select" data-geo-select="target" data-id="${target.id}">Destino ${target.id + 1}</button><select data-geo-assign="${index}" aria-label="Ítem del destino ${target.id + 1}">${['<option value="">Sin asignar</option>'].concat(state.items.map(item => `<option value="${item.id}" ${String(state.correct[index]) === String(item.id) ? 'selected' : ''}>Ítem ${item.id + 1}</option>`)).join('')}</select></li>`).join('') || '<li class="geometry-empty-row">Añade un destino o arrastra sobre la imagen.</li>'}</ul>
    <h3>Ítems arrastrables (${state.items.length})</h3>
    <p>Sus recortes salen de la misma imagen. Puedes moverlos y redimensionarlos en el modo <b>Recortes</b>.</p>
    <ul class="geometry-items">${state.items.map(item => `<li class="${selected('item', item.id) ? 'selected' : ''}">${thumb(item)}<div><strong>Ítem ${item.id + 1}</strong><small>${item.rect ? `${Math.round(item.rect.x)}, ${Math.round(item.rect.y)} · ${Math.round(item.rect.width)}×${Math.round(item.rect.height)}` : 'Sin recorte'}</small></div><div class="geometry-item-actions"><button type="button" class="secondary" data-geo-select="item" data-id="${item.id}">Recorte</button><button type="button" class="secondary" data-geo-regen="${item.id}">Regenerar</button><label class="secondary geometry-file">Imagen<input type="file" accept="image/jpeg,image/png,image/gif,image/bmp,image/webp" data-geo-file="item-image" data-item="${item.id}" hidden></label><button type="button" class="text-delete" data-geo-delete="item" data-id="${item.id}" aria-label="Eliminar ítem ${item.id + 1}">×</button></div></li>`).join('') || '<li class="geometry-empty-row">Añade un ítem para crear su recorte.</li>'}</ul>
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
     <label class="secondary geometry-file">Cambiar imagen<input type="file" accept="image/jpeg,image/png,image/gif,image/bmp,image/webp" data-geo-file="image" hidden></label>
     <span class="geometry-size">${size.width} × ${size.height} px</span>
    </div>
    <p class="geometry-help">${isHot() ? 'Arrastra sobre la imagen para dibujar una zona. Mueve desde el interior y usa los tiradores para ajustar.' : state.mode === 'target' ? 'Los destinos verdes se dibujan sobre la imagen. Asigna cada uno a un ítem en la lista.' : 'Arrastra los recortes azules para ajustar de dónde se extrae cada ítem. Después pulsa Regenerar.'}</p>
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

  function point(event, board) {
   const rect = board.getBoundingClientRect();
   return {
    x:(event.clientX - rect.left) * state.image.width / rect.width,
    y:(event.clientY - rect.top) * state.image.height / rect.height
   };
  }
  function listen(move, up) {
   const onMove = event => { event.preventDefault(); move(event); };
   const onUp = event => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    up(event);
   };
   document.addEventListener('pointermove', onMove);
   document.addEventListener('pointerup', onUp);
   document.addEventListener('pointercancel', onUp);
  }
  function dragRect(event, kind, id, handle) {
   const board = host.querySelector('[data-geo-board]');
   const original = getRect(kind, id);
   if (!board || !original) return;
   const start = point(event, board);
   const element = host.querySelector(`[data-zone-kind="${kind}"][data-zone-id="${id}"]`);
   const size = bounds();
   if (!element) return;
   listen(moveEvent => {
    const next = point(moveEvent, board);
    const dx = next.x - start.x, dy = next.y - start.y;
    const rect = handle ? geometry.resizeRect(original, handle, dx, dy, size) : geometry.moveRect(original, dx, dy, size);
    setRect(kind, id, rect);
    applyStyle(element, rect);
   }, () => {
    setRect(kind, id, geometry.clampRect(geometry.roundRect(getRect(kind, id)), size));
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
    const item = kind === 'item' ? {id:nextId('item'), rect:defaultRect('item'), image:null} : {id:nextId(kind), ...defaultRect(kind)};
    if (kind === 'area') state.areas.push(item);
    else if (kind === 'target') { state.targets.push(item); state.correct.push(null); }
    else state.items.push(item);
    state.selected = {kind, id:item.id};
    if (kind === 'item') state.mode = 'item';
    emit(); render();
   } else if (name === 'delete') {
    if (state.selected) deleteItem(state.selected.kind, state.selected.id);
   } else if (name === 'correct') {
    if (!state.selected || state.selected.kind !== 'area') { setStatus('Selecciona una zona para marcarla como correcta.', true); return; }
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
    state.correct[index] = value;
    emit(); render();
    return;
   }
   if (event.target.matches('[data-geo-correct]')) {
    const id = Number(event.target.dataset.geoCorrect);
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
    const next = geometry.normalizeRect(start, point(moveEvent, board), bounds());
    Object.assign(rect, next);
    applyStyle(temp, rect);
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
    emit(); render();
   });
  });

  host.addEventListener('keydown', event => {
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
