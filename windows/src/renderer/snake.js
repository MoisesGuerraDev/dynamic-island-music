// Snake. The rules are plain functions so they can be tested without a screen.

export const GRID = { w: 42, h: 10, cell: 15 };

export function newGame(rand = Math.random) {
  const snake = [{ x: 6, y: 5 }, { x: 5, y: 5 }, { x: 4, y: 5 }];
  return { snake, dir: { x: 1, y: 0 }, food: placeFood(snake, rand), score: 0, over: false };
}

export function placeFood(snake, rand = Math.random) {
  for (let i = 0; i < 200; i++) {
    const f = { x: Math.floor(rand() * GRID.w), y: Math.floor(rand() * GRID.h) };
    if (!snake.some((p) => p.x === f.x && p.y === f.y)) return f;
  }
  return { x: 0, y: 0 };
}

/** Turning straight back into the body is not allowed. */
export function turn(game, d) {
  if (game.snake.length > 1 && d.x === -game.dir.x && d.y === -game.dir.y) return;
  game.dir = d;
}

export function step(game, rand = Math.random) {
  if (game.over) return game;
  const head = { x: game.snake[0].x + game.dir.x, y: game.snake[0].y + game.dir.y };
  const hit = head.x < 0 || head.y < 0 || head.x >= GRID.w || head.y >= GRID.h || game.snake.some((p) => p.x === head.x && p.y === head.y);
  if (hit) {
    game.over = true;
    return game;
  }
  game.snake.unshift(head);
  if (head.x === game.food.x && head.y === game.food.y) {
    game.score++;
    game.food = placeFood(game.snake, rand);
  } else {
    game.snake.pop();
  }
  return game;
}

/** Milliseconds per step: starts at `base` and gets faster with the score when "progressive" is on. */
export function speedFor(base, score, progressive) {
  return progressive ? Math.max(55, base - score * 3) : base;
}

export const KEYS = {
  ArrowUp: { x: 0, y: -1 }, w: { x: 0, y: -1 }, W: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 }, s: { x: 0, y: 1 }, S: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 }, a: { x: -1, y: 0 }, A: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 }, d: { x: 1, y: 0 }, D: { x: 1, y: 0 },
};

export function draw(canvas, game, color) {
  const x = canvas.getContext('2d');
  const S = GRID.cell;
  x.clearRect(0, 0, canvas.width, canvas.height);
  x.fillStyle = color;
  game.snake.forEach((p, i) => {
    x.globalAlpha = Math.max(0.35, 1 - i * 0.025);
    x.fillRect(p.x * S + 1, p.y * S + 1, S - 2, S - 2);
  });
  x.globalAlpha = 1;
  x.fillStyle = '#fff';
  x.fillRect(game.food.x * S + 3, game.food.y * S + 3, S - 6, S - 6);
}
