/** Minimal ANSI styling, so the plugin ships with no runtime dependencies. */
const enabled = Boolean(process.stdout.isTTY);

const style = (open: number, close: number) => (s: string) =>
  enabled ? `\x1b[${open}m${s}\x1b[${close}m` : s;

const pc = {
  bold: style(1, 22),
  dim: style(2, 22),
  italic: style(3, 23),
  red: style(31, 39),
  green: style(32, 39),
  yellow: style(33, 39),
  cyan: style(36, 39),
  white: style(37, 39),
};

export default pc;
