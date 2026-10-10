type Cookie = { name: string; value: string };

/** Minimal stand-in for the Next.js cookie store. */
class CookieJar {
  private store = new Map<string, string>();
  get(name: string): Cookie | undefined {
    const value = this.store.get(name);
    return value === undefined ? undefined : { name, value };
  }
  set(name: string, value: string, opts?: { maxAge?: number }) {
    if (opts?.maxAge === 0 || value === "") this.store.delete(name);
    else this.store.set(name, value);
  }
  delete(name: string) {
    this.store.delete(name);
  }
  clear() {
    this.store.clear();
  }
  getAll() {
    return [...this.store].map(([name, value]) => ({ name, value }));
  }
}

export const cookieJar = new CookieJar();
