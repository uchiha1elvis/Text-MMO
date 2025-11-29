const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("session");

    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        browser: ["Mac OS", "Chrome", "14.4.1"]
    });

    sock.ev.on("creds.update", saveCreds);

    // Connection updates (QR, reconnect)
    sock.ev.on("connection.update", (update) => {
        const { connection, qr } = update;

        if (qr) {
            console.log("\n🔹 Scan this QR code with your phone:\n");
            qrcode.generate(qr, { small: true });
        }

        if (connection === "open") {
            console.log("✔ Bot connected!");
        }

        if (connection === "close") {
            console.log("❌ Connection closed, restarting...");
            startBot(); // auto-reconnect
        }
    });

    // Message listener
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        // Get text from any type of message
        const type = Object.keys(msg.message)[0];
        const text =
            msg.message[type]?.text ||
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            "";

        if (!text) return;
        if (!msg.key.remoteJid.endsWith("@g.us")) return; // only groups

        // Admin-only tagall
        if (text.toLowerCase() === ".tagall") {
            const group = await sock.groupMetadata(msg.key.remoteJid);
            const senderId = msg.key.participant || msg.key.remoteJid;

            const isAdmin = group.participants
                .filter(p => p.isAdmin)
                .some(p => p.id === senderId);

            if (!isAdmin) {
                await sock.sendMessage(msg.key.remoteJid, {
                    text: "❌ Only group admins can use this command."
                });
                return;
            }

            // Tag everyone
            const participants = group.participants.map(p => p.id);
            await sock.sendMessage(msg.key.remoteJid, {
                text:
                    "Tagging everyone:\n\n" +
                    participants.map(p => `@${p.split("@")[0]}`).join(" "),
                mentions: participants
            });
        }
    });
}

startBot();
