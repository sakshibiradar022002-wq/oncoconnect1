// STUN Binding probe: tests UDP 3478 reachability through the Lightsail firewall.
const dgram = require('dgram');
const crypto = require('crypto');
const sock = dgram.createSocket('udp4');
const msg = Buffer.alloc(20);
msg.writeUInt16BE(0x0001, 0); // STUN Binding Request
msg.writeUInt16BE(0, 2);
msg.writeUInt32BE(0x2112A442, 4); // magic cookie
crypto.randomBytes(12).copy(msg, 8);
sock.on('message', (m) => {
  const type = m.readUInt16BE(0);
  console.log(type === 0x0101
    ? 'STUN_OK: UDP 3478 reachable (binding response received)'
    : 'STUN_UNEXPECTED type 0x' + type.toString(16));
  sock.close();
  process.exit(0);
});
sock.bind(() => {
  sock.send(msg, 3478, '16.4.28.130', () => console.log('binding request sent to 16.4.28.130:3478/udp'));
});
setTimeout(() => {
  console.log('STUN_TIMEOUT: no response in 4s — UDP 3478 likely blocked (Lightsail firewall)');
  sock.close();
  process.exit(2);
}, 4000);
