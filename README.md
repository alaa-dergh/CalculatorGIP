# Tape Calculator

A calculator in plain HTML, CSS and JavaScript (no framework, no `eval`).
Open `index.html` in a browser to run it.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The structure: the screen, the keys, the history tape. |
| `style.css` | The look. Colors are CSS variables at the top (`:root`), with a dark theme that follows the system setting. |
| `script.js` | The logic. Two parts: the engine and the interface. |

## How `script.js` is organized

### 1. The engine (top of the file, between `ENGINE START` and `ENGINE END`)

It turns a string like `2+3×4^2÷8` into a number in three steps.

1. `tokenize` splits the text into numbers and operators.
2. `parse` reads those tokens with one small function per precedence level.
   Each function calls the next-higher one, which is how operator
   precedence works without any special tricks:

   ```
   expr    : term (+ or -) term ...        lowest precedence
   term    : unary (* or /) unary ...
   unary   : - or + before a value
   power   : postfix ^ unary               right-associative: 2^3^2 = 2^(3^2)
   postfix : primary %                     50% = 0.5
   primary : a number, or ( expr )         highest precedence
   ```

   Because `term` calls `unary`, which calls `power`, `*` and `/` always
   bind tighter than `+` and `-`, and `^` binds tighter than both.
3. `evaluate` closes any open parentheses, runs the parser, and rounds
   the result to 12 significant digits so `0.1 + 0.2` shows `0.3`.

Errors such as dividing by zero are thrown as `CalcError` and shown on screen.

### 2. The interface (the function after the engine)

- `state` holds the current expression, the previous one, the history and any error.
- `digit`, `dot`, `op`, `percent`, `openParen`, `closeParen`, `backspace`
  and `clearAll` change the expression the way a user expects, for example
  pressing `+` twice replaces the first `+`.
- `equals` evaluates, saves the calculation to the history and shows the result.
- `render` redraws the screen and the tape from `state`.
- `press(key)` is the single entry point. Clicking a button and pressing a
  keyboard key both call it, which is why keyboard support is small.
- The `keydown` listener at the bottom maps keys like `*`, `/`, `Enter`
  and `Backspace` to the same key names the buttons use.

## Things to try changing

- Add a square root key: put a new function in `primary` in the parser.
- Change the accent color: edit `--accent` in `style.css`.
- Add `Ans` (reuse the last result) using `state.history[0]`.
