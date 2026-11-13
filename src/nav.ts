// Minimal screen stack with hardware/browser back-button support.

export interface Screen {
  el: HTMLElement;
  /** Called when the screen is removed for good. */
  destroy?(): void;
  /** Called when the screen becomes visible again after a screen above it was popped. */
  resume?(): void;
  /** Return false to block leaving (e.g. unsaved changes). May be async. */
  canLeave?(): boolean | Promise<boolean>;
}

const stack: Screen[] = [];
let root: HTMLElement;
let suppressPop = 0;

export function initNav(el: HTMLElement) {
  root = el;
  history.replaceState({ depth: 0 }, '');
  window.addEventListener('popstate', async () => {
    if (suppressPop > 0) {
      suppressPop--;
      return;
    }
    if (stack.length <= 1) return;
    const top = stack[stack.length - 1];
    if (top.canLeave && !(await top.canLeave())) {
      history.pushState({ depth: stack.length - 1 }, '');
      return;
    }
    removeTop();
  });
}

function removeTop() {
  const top = stack.pop();
  if (!top) return;
  top.el.remove();
  top.destroy?.();
  const prev = stack[stack.length - 1];
  if (prev) {
    prev.el.style.display = '';
    prev.resume?.();
  }
}

export function push(screen: Screen) {
  const prev = stack[stack.length - 1];
  if (prev) prev.el.style.display = 'none';
  stack.push(screen);
  screen.el.classList.add('screen');
  root.appendChild(screen.el);
  if (stack.length > 1) history.pushState({ depth: stack.length - 1 }, '');
}

/** Replace the top screen (no history entry added). */
export function replace(screen: Screen) {
  const top = stack.pop();
  if (top) {
    top.el.remove();
    top.destroy?.();
  }
  stack.push(screen);
  screen.el.classList.add('screen');
  root.appendChild(screen.el);
}

/** Programmatic back. Respects canLeave unless force. */
export async function pop(force = false) {
  if (stack.length <= 1) return;
  const top = stack[stack.length - 1];
  if (!force && top.canLeave && !(await top.canLeave())) return;
  suppressPop++;
  history.back();
  removeTop();
}

export function depth() {
  return stack.length;
}
