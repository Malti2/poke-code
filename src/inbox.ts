/**
 * A tiny async queue that bridges the terminal (where the user types tasks) and
 * the `get_user_message` MCP tool (which Poke calls over the tunnel to fetch the
 * next task). This is what lets poke-code work with JUST the tunnel — no
 * outbound message API, no separate API key.
 */
export class TaskInbox {
  private queue: string[] = [];
  private waiters: Array<(task: string) => void> = [];

  /** Called by the terminal when the user submits a task. */
  push(task: string): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter(task);
    else this.queue.push(task);
  }

  /**
   * Called by the `get_user_message` tool. Resolves with the next task, or with
   * `null` after `timeoutMs` so Poke can poll again rather than hang forever.
   */
  next(timeoutMs?: number): Promise<string | null> {
    const queued = this.queue.shift();
    if (queued !== undefined) return Promise.resolve(queued);

    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const waiter = (task: string) => {
        if (timer) clearTimeout(timer);
        resolve(task);
      };
      this.waiters.push(waiter);
      if (timeoutMs && timeoutMs > 0) {
        timer = setTimeout(() => {
          const i = this.waiters.indexOf(waiter);
          if (i >= 0) this.waiters.splice(i, 1);
          resolve(null);
        }, timeoutMs);
      }
    });
  }

  get pending(): number {
    return this.queue.length;
  }
}
