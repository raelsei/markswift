export interface StaticServer {
    /** `http://127.0.0.1:<port>` */
    origin: string;
    addPage(key: string, html: string): string;
    mount(prefix: string, dir: string): string;
    stop(): Promise<void>;
}
/** Serve `rootDir` on an ephemeral loopback port. Resolved paths must stay in their mount. */
export declare function serveDir(rootDir: string): Promise<StaticServer>;
