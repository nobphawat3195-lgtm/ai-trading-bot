# Critique log

## Round 1
Scores: hook 7, readability 3, motion 7, variety 6, brand 6, sync -
1. Many lines invisible: typeIn default out=Infinity -> Inf-Inf = NaN position. Fixed (out=1e9).
2. Step-3 blocks run off the right edge. Moved the start of the staircase to W*0.3.
3. End card leaves too much empty space. Enlarged the title (150 -> 190).

## Round 2
Scores: hook 8, readability 6, motion 8, variety 7, brand 7, sync -
1. Panel 2/3 titles clipped (the clip rect only spanned 0..W, while panels sit in offset coordinates). Widened the clip.
2. Panel title x/y offset counted twice (ox was added twice). Fixed.
3. 9x16: titles overflow the width. Stacked them under the piece and fit them to the width.

## Round 3
Scores: hook 8, readability 8, motion 8, variety 8, brand 8 (no brand assets: own palette), sync 9 (31/33 hits <20 ms, median 1.6 ms)
1. Small labels sat on the tone marks of the big type below them. Opened up the line gaps (S1, S4, panels, end card).
2. 9x16 S1: "2×" overlaps "ทำงานได้". Moved 2× up.
3. Remaining: no real plugin screenshots (abstract shots by design); no VO yet.
