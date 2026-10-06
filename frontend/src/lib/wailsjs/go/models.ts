export namespace main {
	
	export class AppInfo {
	    name: string;
	    version: string;
	    goVersion: string;
	    os: string;
	    arch: string;
	    hostname: string;
	    cpus: number;
	
	    static createFrom(source: any = {}) {
	        return new AppInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.version = source["version"];
	        this.goVersion = source["goVersion"];
	        this.os = source["os"];
	        this.arch = source["arch"];
	        this.hostname = source["hostname"];
	        this.cpus = source["cpus"];
	    }
	}
	export class Document {
	    id: number;
	    title: string;
	    folderId?: number;
	    createdAt: number;
	    updatedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new Document(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.folderId = source["folderId"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class DocumentPatch {
	    title?: string;
	    folderId?: number;
	    moveFolder: boolean;
	    updatedAt?: number;
	
	    static createFrom(source: any = {}) {
	        return new DocumentPatch(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.folderId = source["folderId"];
	        this.moveFolder = source["moveFolder"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class FetchHead {
	    status: number;
	    statusText: string;
	    headers: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new FetchHead(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.statusText = source["statusText"];
	        this.headers = source["headers"];
	    }
	}
	export class FetchRequest {
	    id: string;
	    method: string;
	    url: string;
	    headers: Record<string, string>;
	    body: string;
	
	    static createFrom(source: any = {}) {
	        return new FetchRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.method = source["method"];
	        this.url = source["url"];
	        this.headers = source["headers"];
	        this.body = source["body"];
	    }
	}
	export class Folder {
	    id: number;
	    name: string;
	    parentId?: number;
	    createdAt: number;
	
	    static createFrom(source: any = {}) {
	        return new Folder(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.parentId = source["parentId"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class Settings {
	    accent: string;
	    glowSize: number;
	    scanlines: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.accent = source["accent"];
	        this.glowSize = source["glowSize"];
	        this.scanlines = source["scanlines"];
	    }
	}
	export class Snapshot {
	    id: number;
	    documentId: number;
	    timestamp: number;
	    message: string;
	    tree: string;
	
	    static createFrom(source: any = {}) {
	        return new Snapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.documentId = source["documentId"];
	        this.timestamp = source["timestamp"];
	        this.message = source["message"];
	        this.tree = source["tree"];
	    }
	}
	export class Snippet {
	    id: number;
	    name: string;
	    description: string;
	    tree: string;
	    createdAt: number;
	
	    static createFrom(source: any = {}) {
	        return new Snippet(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.tree = source["tree"];
	        this.createdAt = source["createdAt"];
	    }
	}

}

