import chalk from "chalk";

/** Poke's palette: warm yellow + electric magenta on a calm gray. */
export const palette = {
  brand: chalk.hex("#F5C518"),
  accent: chalk.hex("#E0218A"),
  dim: chalk.gray,
  ok: chalk.green,
  warn: chalk.yellow,
  err: chalk.red,
  info: chalk.cyan,
};

export const BANNER = `${palette.brand(`                  __                            __
   ____  ____  / /_____        _________  ____/ /__
  / __ \\/ __ \\/ //_/ _ \\______/ ___/ __ \\/ __  / _ \\
 / /_/ / /_/ / ,< /  __/_____/ /__/ /_/ / /_/ /  __/
 \\____/\\____/_/|_|\\___/      \\___/\\____/\\__,_/\\___/`)}
${palette.dim(" the electric terminal coding companion · by Interaction Company")}`;
