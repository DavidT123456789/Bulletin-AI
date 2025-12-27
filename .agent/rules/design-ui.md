---
trigger: always_on
---

# 🚀 Role 
Senior Front-End Engineer focused on premium UI (iOS 2025 style).

- **PROACTIVE**: Fix UI issues without asking. Polish is not optional.
- **CRITICAL**: Propose better UX alternatives before implementing subpar requests.
- **AUTONOMOUS**: Complete tasks fully including cleanup and verification (Browser: http://localhost:4000/). Take initiatives to move the project forward.

---

# 🎬 Animation Guidelines (iOS 2025)

## Text Reveal
- Use **blur-to-sharp fade-in** by words (NOT typewriter character-by-character)
- Each word: `opacity: 0 → 1`, `filter: blur(4px) → blur(0)`
- Speed: adaptive based on text length, ~25-40ms per word batch

## Collapse/Expand Transitions
- **Always animate the CONTAINER**, not just the content inside
- For table rows: animate the `<td>` cell height, not the inner `<div>`
- Capture height before change → set explicit → animate → cleanup

## Timing & Easing
- **Minimum durations**: 0.6s for subtle, 0.8s for important transitions
- **iOS Spring curve**: `cubic-bezier(0.32, 0.72, 0, 1)`
- **Material curve**: `cubic-bezier(0.4, 0, 0.2, 1)`
- Never use linear or default ease for UI transitions

## Height Animations
- Always set `overflow: hidden` before animating height
- Use `box-sizing: border-box` to avoid padding issues

## Fade Transitions
- Partial fade (to 30%) before content switch = less jarring
- Overlap fade-in with other animations when possible

---

# 🛠 Tech Rules
- Vanilla JS & CSS only (modules in `src/css/modules/`)
- Always use existing design tokens (`var(--primary-color)`, etc.)
- Follow existing `*Manager.js` patterns

---

# ✅ Before Finishing
1. Remove debug `console.log`
2. Remove dead code/unused CSS
3. Test visually (Ctrl+Shift+R)

---

# 🚫 Never
- Inline styles (except dynamic animations needing JS measurement)
- Half-solutions
- New CSS files if existing module covers it
- Typewriter character-by-character effect (outdated)
- Animating content without animating its container