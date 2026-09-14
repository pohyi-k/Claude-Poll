const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const QRCode = require('qrcode');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;

const questions = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8')
);

if (!Array.isArray(questions) || questions.length === 0) {
  console.error('questions.json must contain a non-empty array of questions.');
  process.exit(1);
}

// ---- In-memory state (single live session, reset on server restart) ----
let state = {
  currentIndex: 0,
  // answers[qIndex] = { clientId: answer }
  // answer is an optionIndex (number) for "yesno" questions,
  // or a normalized word/phrase (string) for "wordcloud" questions.
  answers: questions.map(() => ({}))
};

// clientId -> most recent socket.id, so we can tell "still connected"
const participants = new Map();

// Keeps word-cloud submissions short and groups near-duplicates together
// (trim, collapse whitespace, cap to 3 words / 40 chars, lowercase).
function normalizeWordSubmission(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return null;
  s = s.split(' ').slice(0, 3).join(' ');
  if (s.length > 40) s = s.slice(0, 40).trim();
  return s.toLowerCase();
}

function displayWord(normalized) {
  return normalized.replace(/\b\w/g, (c) => c.toUpperCase());
}

function getResults(qIndex) {
  const q = questions[qIndex];
  const answers = state.answers[qIndex];

  if (q.type === 'wordcloud') {
    const counts = new Map();
    Object.values(answers).forEach((word) => {
      counts.set(word, (counts.get(word) || 0) + 1);
    });
    const words = [...counts.entries()]
      .map(([text, count]) => ({ text: displayWord(text), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 60);
    return { words, total: Object.keys(answers).length };
  }

  const counts = q.options.map(() => 0);
  Object.values(answers).forEach((optIdx) => {
    if (counts[optIdx] !== undefined) counts[optIdx]++;
  });
  return { counts, total: Object.keys(answers).length };
}

function currentStatePayload(clientId, role) {
  const answers = state.answers[state.currentIndex];
  return {
    currentIndex: state.currentIndex,
    totalQuestions: questions.length,
    question: questions[state.currentIndex],
    results: getResults(state.currentIndex),
    participantCount: participants.size,
    yourAnswer:
      role === 'participant' && clientId !== undefined
        ? answers[clientId]
        : undefined
  };
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// The bare root URL is what people actually click (Render's URL, a QR
// scan landing page, etc.) — send it to the participant screen, since
// that's who the public link is really for.
app.get('/', (req, res) => res.redirect('/participant.html'));
app.get('/host', (req, res) => res.redirect('/host.html'));

// Server-side QR code for the participant join link, based on however
// the app is currently being reached (works for localhost, LAN IP, or
// a public deployed domain — no hardcoding needed).
app.get('/api/qr', async (req, res) => {
  try {
    const joinUrl = `${req.protocol}://${req.get('host')}/participant.html`;
    const dataUrl = await QRCode.toDataURL(joinUrl, {
      margin: 1,
      width: 400,
      color: { dark: '#2B2620', light: '#EDE7DD' }
    });
    res.json({ dataUrl, url: joinUrl });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// Every connected socket gets its OWN view of state (their own answer
// status matters for their UI), so broadcasts are sent per-socket rather
// than as one io.emit — otherwise a generic broadcast would wipe out the
// participant's "already answered" status right after they submit.
function broadcastState() {
  for (const [, s] of io.sockets.sockets) {
    s.emit('state', currentStatePayload(s.data.clientId, s.data.role));
  }
}

io.on('connection', (socket) => {
  socket.on('join', ({ role, clientId }) => {
    socket.data.role = role;
    socket.data.clientId = clientId;

    if (role === 'participant' && clientId) {
      participants.set(clientId, socket.id);
    }

    socket.emit('state', currentStatePayload(clientId, role));

    if (role === 'participant') {
      broadcastState();
    }
  });

  socket.on('vote', ({ clientId, optionIndex, text }) => {
    if (!clientId) return;
    const answers = state.answers[state.currentIndex];
    if (answers[clientId] !== undefined) return; // no double-answering
    const q = questions[state.currentIndex];

    if (q.type === 'wordcloud') {
      const normalized = normalizeWordSubmission(text);
      if (!normalized) return;
      answers[clientId] = normalized;
    } else {
      if (typeof optionIndex !== 'number') return;
      if (optionIndex < 0 || optionIndex >= q.options.length) return;
      answers[clientId] = optionIndex;
    }

    broadcastState();
  });

  socket.on('hostNext', () => {
    if (state.currentIndex < questions.length - 1) {
      state.currentIndex++;
      broadcastState();
    }
  });

  socket.on('hostReset', () => {
    state.currentIndex = 0;
    state.answers = questions.map(() => ({}));
    broadcastState();
  });

  socket.on('disconnect', () => {
    if (socket.data.role === 'participant' && socket.data.clientId) {
      // Only drop them if this was their most recent socket (avoids a
      // race where a quick refresh looks like a disconnect).
      if (participants.get(socket.data.clientId) === socket.id) {
        participants.delete(socket.data.clientId);
        broadcastState();
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n============================================');
  console.log('  Icebreaker Poll — live server running');
  console.log('============================================');
  console.log(`\n  Host screen (open this on your laptop):`);
  console.log(`    http://localhost:${PORT}/host.html`);
  console.log(`\n  Participant screen (for local-hotspot fallback mode):`);
  console.log(`    http://localhost:${PORT}/participant.html`);

  const nets = os.networkInterfaces();
  const lanAddresses = [];
  Object.values(nets).forEach((ifaceList) => {
    (ifaceList || []).forEach((net) => {
      if (net.family === 'IPv4' && !net.internal) {
        lanAddresses.push(net.address);
      }
    });
  });

  if (lanAddresses.length > 0) {
    console.log(`\n  Participants on your local network should scan/visit:`);
    lanAddresses.forEach((addr) => {
      console.log(`    http://${addr}:${PORT}/participant.html`);
    });
  } else {
    console.log(`\n  No local network IP detected — connect to Wi-Fi/hotspot`);
    console.log(`  and restart if you need local-fallback mode.`);
  }
  console.log('\n============================================\n');
});
