# JuryHour logo system: Direction 01, "The Gate"

## Colors
| Name        | HEX     | RGB           |
|-------------|---------|---------------|
| Ink         | #14213D | 20, 33, 61    |
| Verdict red | #D8342C | 216, 52, 44   |
| Paper       | #EEF2F8 | 238, 242, 248 |

Red is only ever the slash. One-color files (black, white, red) keep the cut-outs, so they work on any background.

## Files
- `svg/`: every version with the text converted to shapes, on transparent backgrounds with tight bounds.
  - Versions: `horizontal`, `stacked`, `symbol` (4 strokes, use at 24px and up), `symbol-small` (3 strokes on a 16px grid, use at 16–24px), `wordmark`.
  - Colors: `fullcolor` (on paper or white), `ondark` (on ink or dark), `black`, `white`, `red`.
  - Icons: `app-icon-dark` / `app-icon-light` (rounded square) and `avatar-dark` / `avatar-light` (circle).
- `png/`: symbol, app icons and avatars at 16, 32, 48, 180, 192, 512 and 1024 px. The 16px symbol uses the small symbol; app icons and avatars at 16 and 32px use it too, because the mark inside them is under 24px.
- `web/`: `favicon.ico` (16/32/48), `favicon.svg` (switches to paper strokes in dark mode), `apple-touch-icon.png` (180, full bleed), `icon-192.png`, `icon-512.png`.

## Web head snippet
```html
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
```

## Rules
- Clear space: X on all sides, where X = the cap height of "JuryHour" (for the symbol alone, X = 5/8 of the stroke height).
- Minimum sizes: horizontal 96px wide, stacked 56px wide, wordmark 72px wide, 4-stroke symbol 24px, small symbol 16px.
- Horizontal lockup: the symbol is 1.6x the cap height and centered on the caps; the gap is 1/3 of the symbol width.
- Wordmark: Schibsted Grotesk ExtraBold, -2% tracking, yH tightened, ur tightened, J terminal recut at 24 degrees to echo the slash. Always use the outlined files, never retype the name.
