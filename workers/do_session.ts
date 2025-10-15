export class SessionDOId {
  id: string;
  constructor(id: string) {
    this.id = id;
  }
  toString() {
    return this.id;
  }
}

export class SessionDO {
    state: DurableObjectState;
    storage: DurableObjectStorage;
    memory: { createdAt?: number; lastScoreKey?: string; lastSummaryKey?: string; chatHistory: Array<{role: string, content: string}> } = { chatHistory: [] };
  
    constructor(state: DurableObjectState, env: any) {
      this.state = state;
      this.storage = state.storage;
    }
  
    async fetch(req: Request) {
      const url = new URL(req.url);
      if (url.pathname.endsWith('/init') && req.method === 'POST') {
        const body = await req.json() as { createdAt: number };
        this.memory.createdAt = body.createdAt;
        await this.storage.put('memory', this.memory);
        return new Response(JSON.stringify({ ok: true }));
      }
      if (url.pathname.endsWith('/memo') && req.method === 'POST') {
        const patch = await req.json() as Partial<typeof this.memory>;
        const current = (await this.storage.get('memory')) as Partial<typeof this.memory> || {};
        const next = { ...current, ...patch };
        await this.storage.put('memory', next);
        return new Response(JSON.stringify({ ok: true, memory: next }));
      }
      if (url.pathname.endsWith('/get') && req.method === 'GET') {
        const mem = (await this.storage.get('memory')) || {};
        return new Response(JSON.stringify(mem));
      }
      return new Response('Not Found', { status: 404 });
    }
}
  