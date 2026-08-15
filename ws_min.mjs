/* ★★v114 #277: 最小のWebSocketサーバー(外部ライブラリなし)
   ★npmの ws が入れられない環境なので手で書いた。とはいえ難しい所は無い:
     ①HTTPの「Upgrade」に対して決められた合言葉(Sec-WebSocket-Accept)を返す
     ②あとは【フレーム】という小さな封筒でテキストをやり取りするだけ
   ★受け取る側(ブラウザ→サーバー)のフレームは必ずマスクされている(仕様)。
     送る側(サーバー→ブラウザ)はマスクしない。ここを取り違えると何も届かない。
   ★大きな本文(126バイト以上)の長さの書き方が3通りある —— そこだけ丁寧に。 */
import crypto from 'crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export function acceptKey(key) {
  return crypto.createHash('sha1').update(key + GUID).digest('base64');
}

/* テキスト1本を封筒に入れる(サーバー→クライアント。マスクなし) */
export function encodeText(str) {
  const body = Buffer.from(str, 'utf8');
  const n = body.length;
  let head;
  if (n < 126) {
    head = Buffer.alloc(2);
    head[0] = 0x81; head[1] = n;
  } else if (n < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x81; head[1] = 126; head.writeUInt16BE(n, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x81; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2);
  }
  return Buffer.concat([head, body]);
}
export function encodeClose() { return Buffer.from([0x88, 0]); }
export function encodePong(payload) {
  const b = payload && payload.length ? payload : Buffer.alloc(0);
  return Buffer.concat([Buffer.from([0x8a, b.length]), b]);
}

/* 受け取った生データから、取り出せるだけフレームを取り出す。
   戻り値: { frames: [{op, data}], rest: Buffer }  ——
   ★足りなければ rest に残して次のデータを待つ(TCPは境目を保証しない)。 */
export function decodeFrames(buf) {
  const frames = [];
  let off = 0;
  for (;;) {
    if (buf.length - off < 2) break;
    const b0 = buf[off], b1 = buf[off + 1];
    const op = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let p = off + 2;
    if (len === 126) {
      if (buf.length - p < 2) break;
      len = buf.readUInt16BE(p); p += 2;
    } else if (len === 127) {
      if (buf.length - p < 8) break;
      len = Number(buf.readBigUInt64BE(p)); p += 8;
    }
    /* ★v170 #340: 申告された長さがそもそも大きすぎる = 相手にする必要がない。
       ★ここで弾かないと、下の「足りないから待つ」が無限の待ちになる。 */
    if (!(len >= 0) || len > MAX_FRAME) return { frames, rest: Buffer.alloc(0), tooBig: true };
    let mask = null;
    if (masked) {
      if (buf.length - p < 4) break;
      mask = buf.subarray(p, p + 4); p += 4;
    }
    if (buf.length - p < len) break;
    const body = Buffer.from(buf.subarray(p, p + len));
    if (mask) for (let i = 0; i < body.length; i++) body[i] ^= mask[i & 3];
    frames.push({ op, data: body });
    off = p + len;
  }
  return { frames, rest: buf.subarray(off) };
}

/* http サーバーに WebSocket を生やす。
   onOpen(sock) / onText(sock, str) / onClose(sock) を受け取るだけの薄い層。 */
/* ★★★v170 #340: 【受け取ってよい大きさの上限】。公開の前に必ず要る。
   ★v114〜v169 は上限が1つも無かった:
     ①フレームの長さは相手が申告する(最大 2^64)。大きいと言われたぶん待つ
     ②届いたデータは buf にどこまでも足していく(Buffer.concat)
     → つまり【完成しないフレームを流し続けるだけで、サーバーのメモリを食い潰せる】。
       攻撃道具も要らない。素のWebSocketで数行書けば誰でもできる。
   ★ゲームが実際に送る電文は200バイト以下。16KBもあれば天井として充分。
   ★上限を超えたら黙って切る —— 理由を返すと、探る側に手がかりを与える。 */
const MAX_FRAME = 16 * 1024;      // 1フレームの上限
const MAX_BUF = 64 * 1024;        // 組み立て途中の溜め込みの上限
export function attachWs(server, { onOpen, onText, onClose }) {
  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`
    );
    socket.setNoDelay(true);
    const sock = {
      raw: socket,
      /* ★v170 #340: どこから来たか。1つのIPからの繋ぎすぎを止めるのに使う。 */
      ip: (socket.remoteAddress || '').replace(/^::ffff:/, ''),
      open: true,
      send(str) { if (this.open) { try { socket.write(encodeText(str)); } catch (e) { /* 切れた */ } } },
      close() { if (this.open) { this.open = false; try { socket.write(encodeClose()); socket.end(); } catch (e) {} } },
    };
    /* ★v170 #340: data の中から呼ぶので、先に宣言しておく */
    const done = () => { if (sock.open) { sock.open = false; onClose && onClose(sock); } };
    let buf = Buffer.alloc(0);
    socket.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      /* ★v170 #340: 組み立て途中がここまで膨らむのは、まともな客ではない */
      if (buf.length > MAX_BUF) { try { socket.destroy(); } catch (e) {} done(); return; }
      const r = decodeFrames(buf);
      if (r.tooBig) { try { socket.destroy(); } catch (e) {} done(); return; }
      buf = r.rest;
      for (const f of r.frames) {
        if (f.op === 0x8) { sock.open = false; try { socket.end(); } catch (e) {} onClose && onClose(sock); return; }
        if (f.op === 0x9) { try { socket.write(encodePong(f.data)); } catch (e) {} continue; }
        if (f.op === 0x1) onText && onText(sock, f.data.toString('utf8'));
      }
    });
    socket.on('close', done);
    socket.on('error', done);
    onOpen && onOpen(sock);
  });
}
