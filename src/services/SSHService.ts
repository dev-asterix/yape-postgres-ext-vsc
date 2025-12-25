import { Client, ClientChannel, ConnectConfig } from 'ssh2';
import * as fs from 'fs';
import { Stream } from 'stream';

export interface SSHConfig {
  host: string;
  port: number;
  username: string;
  privateKeyPath?: string;
  password?: string;
}

export class SSHService {
  private static instance: SSHService;

  private constructor() { }

  public static getInstance(): SSHService {
    if (!SSHService.instance) {
      SSHService.instance = new SSHService();
    }
    return SSHService.instance;
  }

  public createStream(sshConfig: SSHConfig, dbHost: string, dbPort: number): Promise<Stream> {
    return new Promise((resolve, reject) => {
      const conn = new Client();

      conn.on('ready', () => {
        // Forward traffic to database
        conn.forwardOut(
          '127.0.0.1', // Source IP (can be arbitrary)
          0,           // Source Port (can be arbitrary)
          dbHost,      // Destination DB Host
          dbPort,      // Destination DB Port
          (err, stream) => {
            if (err) {
              conn.end();
              reject(err);
              return;
            }

            // Close SSH connection when stream closes
            stream.on('close', () => {
              conn.end();
            });

            resolve(stream);
          }
        );
      }).on('error', (err) => {
        reject(err);
      });

      try {
        const connectConfig: ConnectConfig = {
          host: sshConfig.host,
          port: sshConfig.port,
          username: sshConfig.username
        };

        if (sshConfig.privateKeyPath) {
          try {
            connectConfig.privateKey = fs.readFileSync(sshConfig.privateKeyPath);
          } catch (err) {
            reject(new Error(`Failed to read private key at ${sshConfig.privateKeyPath}: ${err}`));
            return;
          }
        } else if (sshConfig.password) {
          connectConfig.password = sshConfig.password;
        }

        conn.connect(connectConfig);
      } catch (err) {
        reject(err);
      }
    });
  }
}
