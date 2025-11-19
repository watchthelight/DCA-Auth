import * as net from 'net';
import * as tls from 'tls';
import * as dgram from 'dgram';
import type { SIEMEvent } from '../siem.service';

export class SyslogConnector {
  private config: {
    host: string;
    port: number;
    protocol: 'tcp' | 'udp' | 'tls';
    facility?: number;
    appName?: string;
  };
  private socket?: net.Socket | dgram.Socket;

  constructor(config: {
    host: string;
    port: number;
    protocol: 'tcp' | 'udp' | 'tls';
    facility?: number;
    appName?: string;
  }) {
    this.config = config;
    this.connect();
  }

  private connect() {
    switch (this.config.protocol) {
      case 'tcp':
        this.socket = net.createConnection({
          host: this.config.host,
          port: this.config.port
        });
        break;
      case 'tls':
        this.socket = tls.connect({
          host: this.config.host,
          port: this.config.port,
          rejectUnauthorized: false
        });
        break;
      case 'udp':
        this.socket = dgram.createSocket('udp4');
        break;
    }
  }

  async send(events: SIEMEvent[]): Promise<void> {
    for (const event of events) {
      const syslogMessage = this.formatSyslogMessage(event);
      await this.sendMessage(syslogMessage);
    }
  }

  private formatSyslogMessage(event: SIEMEvent): string {
    const facility = this.config.facility || 16; // Local0
    const severity = this.mapSeverityToSyslog(event.severity);
    const priority = facility * 8 + severity;

    const timestamp = event.timestamp.toISOString();
    const hostname = event.source.hostname;
    const appName = this.config.appName || 'dca-auth';
    const procId = process.pid;
    const msgId = event.eventType;

    // Structured data
    const structuredData = this.formatStructuredData(event);

    // Message content
    const message = JSON.stringify({
      category: event.category,
      details: event.details
    });

    // RFC 5424 format
    return `<${priority}>1 ${timestamp} ${hostname} ${appName} ${procId} ${msgId} ${structuredData} ${message}`;
  }

  private mapSeverityToSyslog(severity: string): number {
    switch (severity) {
      case 'critical': return 2; // Critical
      case 'error': return 3; // Error
      case 'warning': return 4; // Warning
      case 'info': return 6; // Informational
      case 'debug': return 7; // Debug
      default: return 6;
    }
  }

  private formatStructuredData(event: SIEMEvent): string {
    const data: string[] = [];

    // Add event metadata
    data.push(`[dca-auth@32473 category="${event.category}" severity="${event.severity}"]`);

    // Add user information if present
    if (event.user) {
      const userParts: string[] = [];
      if (event.user.id) userParts.push(`id="${event.user.id}"`);
      if (event.user.email) userParts.push(`email="${event.user.email}"`);
      if (event.user.role) userParts.push(`role="${event.user.role}"`);
      if (userParts.length > 0) {
        data.push(`[user@32473 ${userParts.join(' ')}]`);
      }
    }

    // Add correlation metadata if present
    if (event.metadata) {
      const metaParts: string[] = [];
      if (event.metadata.correlationId) metaParts.push(`correlationId="${event.metadata.correlationId}"`);
      if (event.metadata.sessionId) metaParts.push(`sessionId="${event.metadata.sessionId}"`);
      if (event.metadata.requestId) metaParts.push(`requestId="${event.metadata.requestId}"`);
      if (metaParts.length > 0) {
        data.push(`[meta@32473 ${metaParts.join(' ')}]`);
      }
    }

    return data.length > 0 ? data.join('') : '-';
  }

  private sendMessage(message: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const buffer = Buffer.from(message);

      if (this.config.protocol === 'udp') {
        const socket = this.socket as dgram.Socket;
        socket.send(buffer, 0, buffer.length, this.config.port, this.config.host, (err) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        const socket = this.socket as net.Socket;
        socket.write(buffer, (err) => {
          if (err) reject(err);
          else resolve();
        });
      }
    });
  }

  // CEF (Common Event Format) support
  formatCEF(event: SIEMEvent): string {
    const cefVersion = 0;
    const deviceVendor = 'DCA-Auth';
    const deviceProduct = 'License Management';
    const deviceVersion = '1.0';
    const signatureId = event.eventType;
    const name = event.eventType;
    const severity = this.mapSeverityToCEF(event.severity);

    // CEF extension fields
    const extensions: string[] = [];
    extensions.push(`cat=${event.category}`);
    extensions.push(`src=${event.source.ip || 'unknown'}`);
    extensions.push(`shost=${event.source.hostname}`);
    extensions.push(`suser=${event.user?.id || 'unknown'}`);
    extensions.push(`msg=${JSON.stringify(event.details)}`);
    extensions.push(`rt=${event.timestamp.getTime()}`);

    if (event.metadata?.correlationId) {
      extensions.push(`cs1Label=CorrelationId cs1=${event.metadata.correlationId}`);
    }
    if (event.metadata?.sessionId) {
      extensions.push(`cs2Label=SessionId cs2=${event.metadata.sessionId}`);
    }

    const cefMessage = `CEF:${cefVersion}|${deviceVendor}|${deviceProduct}|${deviceVersion}|${signatureId}|${name}|${severity}|${extensions.join(' ')}`;

    // Wrap in syslog
    const facility = 16; // Local0
    const syslogSeverity = 6; // Info
    const priority = facility * 8 + syslogSeverity;

    return `<${priority}>${new Date().toISOString()} ${event.source.hostname} ${cefMessage}`;
  }

  private mapSeverityToCEF(severity: string): number {
    switch (severity) {
      case 'debug': return 1;
      case 'info': return 3;
      case 'warning': return 6;
      case 'error': return 8;
      case 'critical': return 10;
      default: return 3;
    }
  }

  // LEEF (Log Event Extended Format) support
  formatLEEF(event: SIEMEvent): string {
    const leefVersion = '2.0';
    const vendor = 'DCA-Auth';
    const product = 'License Management';
    const version = '1.0';
    const eventId = event.eventType;

    const attributes: string[] = [];
    attributes.push(`devTime=${event.timestamp.getTime()}`);
    attributes.push(`severity=${this.mapSeverityToLEEF(event.severity)}`);
    attributes.push(`cat=${event.category}`);
    attributes.push(`srcHostName=${event.source.hostname}`);

    if (event.source.ip) {
      attributes.push(`src=${event.source.ip}`);
    }
    if (event.user?.id) {
      attributes.push(`usrName=${event.user.id}`);
    }

    const leefMessage = `LEEF:${leefVersion}|${vendor}|${product}|${version}|${eventId}|${attributes.join('\t')}`;

    // Wrap in syslog
    const facility = 16; // Local0
    const syslogSeverity = 6; // Info
    const priority = facility * 8 + syslogSeverity;

    return `<${priority}>${new Date().toISOString()} ${event.source.hostname} ${leefMessage}`;
  }

  private mapSeverityToLEEF(severity: string): number {
    switch (severity) {
      case 'debug': return 1;
      case 'info': return 3;
      case 'warning': return 5;
      case 'error': return 7;
      case 'critical': return 10;
      default: return 3;
    }
  }

  async query(params: any): Promise<SIEMEvent[]> {
    // Syslog is write-only, no query support
    throw new Error('Syslog connector does not support queries');
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      if (this.config.protocol === 'udp') {
        (this.socket as dgram.Socket).close();
      } else {
        (this.socket as net.Socket).end();
      }
    }
  }
}