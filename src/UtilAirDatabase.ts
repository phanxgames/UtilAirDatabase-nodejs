import {Server, Socket} from "node:net";
import {exec, execFile} from "node:child_process";
import * as os from "node:os";
import config from "../config.json";

export class UtilAirDatabase {

    public static callbackIncrement:number = 0;
    public static socketServer:Server = null;

    constructor() {
        console.log("UtilAirDatabase");
    }

    public static async createDatabaseFromSQLFile(sqlFilePath: string,
                                                  databasePath: string,
                                                  encryptedKey: string=null)
    {
        let cmd = `sql="${sqlFilePath}" out="${databasePath}"`;
        if (encryptedKey) {
            cmd += ` encrypt=true password="${encryptedKey}"`;
        }
        return this._executeSocketAPI(cmd);
    }

    public static async createDatabaseFromSQLite(sqlitePath: string,
                                                 databasePath: string,
                                                 encryptedKey: string=null)
    {
        let cmd = `db="${sqlitePath}" out="${databasePath}"`;
        if (encryptedKey) {
            cmd += ` encrypt=true password="${encryptedKey}"`;
        }
        return this._executeSocketAPI(cmd);
    }

    public static async decryptDatabase(encryptedDatabasePath: string,
                                        decryptedDatabasePath: string,
                                        encryptedKey: string)
    {
        let cmd = `db="${encryptedDatabasePath}" out="${decryptedDatabasePath}" decrypt=true password="${encryptedKey}"`;
        return this._executeSocketAPI(cmd);
    }

    public static async encryptDatabase(databasePath: string,
                                        encryptedDatabasePath: string,
                                        encryptedKey: string)
    {
        return this.createDatabaseFromSQLite(databasePath, encryptedDatabasePath, encryptedKey);
    }

    public static async createDatabaseFromEncryptedDatabase(encryptedDatabasePath: string,
                                                            encryptedKey: string,
                                                            outDatabasePath: string,
                                                            outEncryptedKey: string=null)
    {
        await this.decryptDatabase(encryptedDatabasePath, outDatabasePath, encryptedKey);
        if (outEncryptedKey) {
            await this.encryptDatabase(outDatabasePath, outDatabasePath, outEncryptedKey);
        }
    }


    protected static _executeSocketAPI(command:string) {
        return new Promise(async (resolve, reject) => {
            const cb = ++this.callbackIncrement;
            command += ` socket=${config.UtilAirDatabase.port} socketcb=${cb} nogui`;

            const _cancelExecution = () => {
                if (timeout) clearTimeout(timeout);
                this._socketCallbacks.delete(cb);
                this._closeSocketServerIfNoCallbacksPending();
            };

            this._socketCallbacks.set(cb, (data:any) => {
                _cancelExecution();

                //parse the response
                if (data.error) {
                    reject(this._formatError(data.message));
                } else {
                    resolve(true);
                }

            });

            //setup a socket server to listen for the response
            this._setupSocketServer();

            let timeout = null;
            if (config.UtilAirDatabase.timeout > 0) {
                timeout = setTimeout(() => {
                    _cancelExecution();
                    reject("timed out");
                }, config.UtilAirDatabase.timeout);
            }

            //call execute on child process of node
            let cmd;
            if (os.platform() === 'win32') {
                cmd = `${config.UtilAirDatabase.path} ${command}`;
            } else if (os.platform() === 'darwin') {
                cmd = `open -a ${config.UtilAirDatabase.path} --args ${command}`;
            }

            console.log("EXEC " + cmd);
            exec(cmd, (error:any, stdout:any, stderr:any) => {
                if (error) {
                    _cancelExecution();
                    reject(`error: ${error.message}`);
                    return;
                }
                if (stderr) {
                    _cancelExecution();
                    reject(`stderr: ${stderr}`);
                    return;
                }
            });


        });
    }

    protected static _socketCallbacks:Map<number, Function> = new Map();

    protected static _setupSocketServer() {
        if (!this.socketServer || !this.socketServer.listening) {
            this.socketServer = new Server();
            this.socketServer.on('connection', (socket: Socket) => {
                socket.on('data', (data:any) => {
                    console.log(`Received: ${data}`);
                    data = JSON.parse(data);
                    //this.socketServer.close();
                    //route the callback to the appropriate function
                    // data.cb is callbackIncrement -> _socketCallbacks.get(data.cb)(data);
                    let fn:Function = this._socketCallbacks.get(data.cb);
                    if (fn) fn(data);
                });
            });
            this.socketServer.listen(config.UtilAirDatabase.port);
        }
        return this.socketServer;
    }

    protected static _closeSocketServerIfNoCallbacksPending() {
        if (this.socketServer && this._socketCallbacks.size === 0) {
            this.socketServer.close();
            this.socketServer = null;
        }
    }

    private static _formatError(message: any) {
        if (Array.isArray(message)) {
            //only join strings
            return message.filter((m) => typeof m === "string").join(", ");
        }
        return message;
    }


}