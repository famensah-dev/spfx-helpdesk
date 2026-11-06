export type ThemeColorRole = 'bg' | 'fg' | 'line';
export function darkColor(value: string, role: ThemeColorRole): string {
  let hex = value.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(part => part + part).join('');
  const alpha = hex.length === 8 ? hex.slice(6) : '';
  const [r,g,b] = [0,2,4].map(index => parseInt(hex.slice(index,index+2),16)/255);
  const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
  const light=(max+min)/2;
  const hue=delta===0?0:max===r?60*(((g-b)/delta+6)%6):max===g?60*((b-r)/delta+2):60*((r-g)/delta+4);
  const saturation=delta===0?0:delta/(1-Math.abs(2*light-1));
  const base=hex.slice(0,6);
  // Keep navigation amber identical in both appearances; priorities use a richer amber.
  if(base==='ffc43d')return '#'+hex;
  if(['ce961c','946700'].includes(base) && role==='fg')return '#f5ad24'+alpha;
  if(base==='ce961c' && role==='bg')return '#f5ad24'+alpha;
  if(base==='fff0bf' && role==='bg')return '#443017'+alpha;
  // Preserve the In Progress purple instead of treating its blue-leaning tint as neutral.
  if(role==='bg' && ['ede9fc','f0eafa'].includes(base))return '#493764'+alpha;
  if(role==='fg' && ['6850a5','8054c7'].includes(base))return '#e3cfff'+alpha;
  const neutral=saturation<.35 || (hue>=195 && hue<=255);
  const tint=(background:boolean):string=>hue<15||hue>=340?(background?'#42282e':'#ffadb8'):hue<45?(background?'#403021':'#ffc68a'):hue<75?(background?'#3d3520':'#f4d780'):hue<165?(background?'#213a2e':'#91dfb1'):hue<195?(background?'#1c3939':'#82d9d2'):(background?'#352b45':'#d0b5f2');
  if(role==='line')return (['337fe5','00899b','2855b6','8ba9cb'].includes(base)?'#80b3ff':'#344860')+alpha;
  if(role==='bg') {
    if(light<.75)return '#'+hex;
    if(['f5f5f9','f5f9ff','f7faff'].includes(base))return '#132238'+alpha;
    if(base==='ffffff')return '#1a2c43'+alpha;
    return (neutral?(light>.93?'#16263c':'#22364f'):tint(true))+alpha;
  }
  if(neutral)return (light<.38?'#f1f3f5':light>.85?'#f7f8fa':'#c3c9d1')+alpha;
  return (light>.85?'#f7f8fa':tint(false))+alpha;
}
export function themeRole(property: string): ThemeColorRole | undefined {
  if (/background|surface|canvas|header$|tint/i.test(property)) return 'bg';
  if (/border|shadow|outline|line$|line-color/i.test(property)) return 'line';
  if (/^color$|^fill$|^stroke$|color$|ink$/i.test(property)) return 'fg';
  return undefined;
}
export function themeToken(role: ThemeColorRole, color: string): string { return '--dp-'+role+'-'+color.replace('#','').toLowerCase(); }
export function darkenStyles(value: unknown, property = ''): unknown {
  if (typeof value === 'string') {
    const role = themeRole(property);
    return role ? value.replace(/#[a-f\d]{8}\b|#[a-f\d]{6}\b|#[a-f\d]{3}\b|\bwhite\b/gi, color => darkColor(color.toLowerCase() === 'white' ? '#ffffff' : color, role)) : value;
  }
  if (Array.isArray(value)) return value.map(item => darkenStyles(item, property));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item]) => [key,darkenStyles(item,key)]));
  return value;
}
