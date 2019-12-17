import { create } from 'enigma.js';
import { buildUrl } from "enigma.js/sense-utilities";
import schema from "enigma.js/schemas/12.20.0.json";
import WebSocket from "ws";

/**
 * Services to create, cache and handle enigma session
 */
export class EnigmaSessionManager {

    private static GLOBAL_SESSION_KEY = "engineData";

    /**
     * array of active session id's
     */
    private activeStack: Array<string>;

    /**
     * all sessions which exists
     */
    private sessionCache: Map<string, enigmaJS.IGeneratedAPI>;

    /**
     * max sessions we could open by default this is 5
     * set to value lte 0 for max sessions
     */
    private maxSessionCount = 5;

    /**
     * connection queue to handle action connections, we could not open same app / global context
     * twice. If an connection is allready runnig save it into connection queue and get it from here
     */
    private connectionQueue: Map<string, Promise<enigmaJS.IGeneratedAPI>>;

    /**
     * Creates an instance of EnigmaSession.
     */
    public constructor(
        private host: string,
        private port: number,
        private secure = true
    ) {
        this.activeStack     = new Array();
        this.connectionQueue = new Map();
        this.sessionCache    = new Map();
    }

    public set maxSessions(max: number) {
        this.maxSessionCount = max;
    }

    public get maxSessions(): number {
        return this.maxSessionCount;
    }

    /**
     * return an existing session object or create a new one
     */
    public async open(): Promise<EngineAPI.IGlobal>;
    public async open(appId: string): Promise<EngineAPI.IApp>;
    public async open(appId?: string): Promise<EngineAPI.IGlobal | EngineAPI.IApp>
    {
        const id = appId || EnigmaSessionManager.GLOBAL_SESSION_KEY;
        let session: enigmaJS.IGeneratedAPI;

        /** create new session */
        if (!this.isCached(id)) {
            session = await this.createSessionObject(id);
        } else {
            session = await this.activateSession(id);
        }
        return "global" in session ? session as EngineAPI.IApp: session as EngineAPI.IGlobal;
    }

    public async close(appId?: string): Promise<void> {
        const key = appId || EnigmaSessionManager.GLOBAL_SESSION_KEY;

        if (this.isCached(key)) {
            await this.loadFromCache(key).session.close();
        }
    }

    /** 
     * activate session if not allready in active stack
     */
    private async activateSession(id: string): Promise<enigmaJS.IGeneratedAPI>
    {
        const connection = this.loadFromCache(id);
        if (connection && !this.isActive(id)) {
            await this.suspendOldestSession();
            await connection.session.resume();
            this.activeStack.push(id);
        }
        return connection;
    }

    /**
     * create new session object, buffer current connections into map
     * so if same connection wants to open twice take existing Promise
     * and return this one.
     */
    private async createSessionObject(id: string): Promise<enigmaJS.IGeneratedAPI>
    {
        if (!this.connectionQueue.has(id)) {
            this.connectionQueue.set(id, new Promise(async (resolve) => {
                await this.suspendOldestSession();

                const url      = this.buildUri(id);
                const session  = create({ schema, url, createSocket: (url: string) => new WebSocket(url) });
                let sessionObj = await session.open();

                if (id !== EnigmaSessionManager.GLOBAL_SESSION_KEY) {
                    sessionObj = await (sessionObj as EngineAPI.IGlobal).openDoc(id);
                }

                this.sessionCache.set(id, sessionObj);
                this.activeStack.push(id);
                this.connectionQueue.delete(id);

                /** register on close event if server was shutdown or connection gets lost */
                sessionObj.on("closed", () => this.removeSessionFromCache(id));

                resolve(sessionObj);
            }));
        }
        return this.connectionQueue.get(id) as Promise<enigmaJS.IGeneratedAPI>;
    }

    private removeSessionFromCache(id) {
        this.isCached(id) ? this.sessionCache.delete(id) : void 0;
        this.isActive(id) ? this.activeStack.splice(this.activeStack.indexOf(id), 1) : void 0;
    }

    /**
     * returns true if session is allready active
     */
    private isActive(id: string): boolean
    {
        return this.activeStack.indexOf(id) > -1;
    }

    /**
     * returns true if session is allready cached
     */
    private isCached(id: string): boolean
    {
        return this.sessionCache.has(id);
    }

    /**
     * load session object from cache
     */
    private loadFromCache(id = EnigmaSessionManager.GLOBAL_SESSION_KEY): enigmaJS.IGeneratedAPI
    {
        let session = this.sessionCache.get(id);
        if (session) {
            return session;
        }
        throw "Session not found";
    }

    /**
     * suspend oldest session
     */
    private async suspendOldestSession(): Promise<void>
    {
        if (this.maxSessions <= 0 || this.activeStack.length < this.maxSessions) {
            return;
        }

        const oldestSessionId = this.activeStack.shift();
        const connection = this.loadFromCache(oldestSessionId);

        if (connection) {
            await connection.session.suspend();
        }
    }

    /**
     * generate new url for websocket call to enigma
     */
    private buildUri(id = EnigmaSessionManager.GLOBAL_SESSION_KEY): string
    {
        return buildUrl({
            appId   : id,
            host    : this.host,
            identity: Math.random().toString(32).substr(2),
            port    : this.port,
            secure  : this.secure,
        });
    }
}
