// Genera src/styles/primereact-theme.css a partire dal tema "Lara light blue" di PrimeReact,
// sostituendo i blu del tema con quelli del mockup FlowSync.
// Uso: npm run theme   (da rilanciare dopo ogni aggiornamento di primereact)
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('..', import.meta.url)
const source = new URL('node_modules/primereact/resources/themes/lara-light-blue/theme.css', root)
const target = new URL('src/styles/primereact-theme.css', root)

// Blu del tema Lara -> blu del mockup (vedi src/styles/tokens.css)
const COLORS = {
  '#3b82f6': '#0b57d0', // primario
  '#2563eb': '#0a4fbd', // primario, hover
  '#1d4ed8': '#0b4fbd', // testo evidenziato
  '#bfdbfe': '#b3cdf6', // anello di focus
  '#eff6ff': '#e8f0fe', // sfondo evidenziato
}

let css = readFileSync(source, 'utf8')

for (const [from, to] of Object.entries(COLORS)) {
  css = css.replace(new RegExp(from, 'gi'), to)
}
css = css.replace(/rgba\(59, ?130, ?246,/g, 'rgba(11, 87, 208,')

// Il tema include il font Inter con un percorso relativo: lo togliamo e usiamo
// @fontsource-variable/inter, importato in main.tsx.
css = css.replace(/@font-face\s*{[^}]*}\s*/g, '')
css = css.replaceAll('"Inter var"', '"Inter Variable"')

const header = `/* FILE GENERATO da scripts/build-theme.mjs: non modificarlo a mano.
 * Tema PrimeReact "lara-light-blue" con i colori del mockup FlowSync. */\n`
writeFileSync(target, header + css)
console.log(`Tema scritto in ${fileURLToPath(target)}`)
