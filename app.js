import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import {
  getFirestore,
  collection,
  addDoc,
  doc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAj2Gb5XLs6XI3flD-EeTtDY2sPH-KSiIs",
  authDomain: "raychat-21e11.firebaseapp.com",
  projectId: "raychat-21e11",
  storageBucket: "raychat-21e11.firebasestorage.app",
  messagingSenderId: "407632322071",
  appId: "1:407632322071:web:e9bdbb613ab34e46960652",
  measurementId: "G-TM8S9TV6YV"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ---------------------------------------------------
   Element refs
--------------------------------------------------- */
const landing = document.getElementById("landing");
const enterBtn = document.getElementById("enterBtn");
const appShell = document.getElementById("app");

const setupCard = document.getElementById("setupCard");
const chatCard = document.getElementById("chatCard");

const usernameInput = document.getElementById("username");
const roomInput = document.getElementById("roomCode");
const joinBtn = document.getElementById("joinBtn");

const roomDisplay = document.getElementById("roomDisplay");
const presenceCount = document.getElementById("presenceCount");
const leaveBtn = document.getElementById("leaveBtn");

const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const messages = document.getElementById("messages");
const emptyState = document.getElementById("emptyState");
const typingIndicator = document.getElementById("typingIndicator");
const typingText = document.getElementById("typingText");
const jumpLatest = document.getElementById("jumpLatest");

/* ---------------------------------------------------
   Cinematic landing -> app transition
--------------------------------------------------- */
enterBtn.addEventListener("click", () => {
  enterBtn.disabled = true;
  landing.classList.add("is-leaving");

  window.setTimeout(() => {
    landing.classList.add("is-hidden");
    appShell.classList.add("is-visible");
    usernameInput.focus();
  }, 900);
});

/* Keep the app usable on mobile keyboards / viewport changes */
function setAppHeight() {
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${h}px`);
}
setAppHeight();
window.addEventListener("resize", setAppHeight);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", setAppHeight);
}

/* ---------------------------------------------------
   Session state
--------------------------------------------------- */
let currentUser = "";
let currentRoom = "";

let unsubMessages = null;
let unsubTyping = null;
let unsubPresence = null;
let presenceInterval = null;
let typingTimeout = null;

const messageEls = new Map();
let initialLoadDone = false;

window.addEventListener("load", () => {
  const savedUser = localStorage.getItem("raychat_username");
  if (savedUser) {
    usernameInput.value = savedUser;
  }
});

/* ---------------------------------------------------
   Join room
--------------------------------------------------- */
function joinRoom() {
  const username = usernameInput.value.trim();
  const room = roomInput.value.trim().toUpperCase();

  if (!username || !room) {
    alert("Enter Username and Room Code");
    return;
  }

  currentUser = username;
  currentRoom = room;

  localStorage.setItem("raychat_username", username);

  roomDisplay.textContent = `Room ${room}`;

  setupCard.classList.add("hidden");
  chatCard.classList.remove("hidden");
  appShell.classList.add("in-chat");

  messageEls.clear();
  messages.innerHTML = "";
  initialLoadDone = false;

  loadMessages();
  initPresence();
  initTyping();
}

joinBtn.addEventListener("click", joinRoom);

[usernameInput, roomInput].forEach((input) => {
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") joinRoom();
  });
});

/* ---------------------------------------------------
   Leave room
--------------------------------------------------- */
leaveBtn.addEventListener("click", () => {
  markOffline();
  setTypingStatus(false);

  clearInterval(presenceInterval);
  clearTimeout(typingTimeout);

  if (unsubMessages) unsubMessages();
  if (unsubTyping) unsubTyping();
  if (unsubPresence) unsubPresence();

  messages.innerHTML = "";
  messageEls.clear();
  emptyState.classList.remove("hidden");
  jumpLatest.classList.add("hidden");
  typingIndicator.classList.add("hidden");

  chatCard.classList.add("hidden");
  setupCard.classList.remove("hidden");
  appShell.classList.remove("in-chat");

  currentRoom = "";
});

window.addEventListener("beforeunload", () => {
  markOffline();
});

/* ---------------------------------------------------
   Sending messages
--------------------------------------------------- */
async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !currentRoom) return;

  sendBtn.classList.add("is-sending");
  messageInput.value = "";
  setTypingStatus(false);
  clearTimeout(typingTimeout);

  try {
    await addDoc(
      collection(db, "rooms", currentRoom, "messages"),
      {
        username: currentUser,
        text: text,
        createdAt: Date.now()
      }
    );
  } finally {
    window.setTimeout(() => sendBtn.classList.remove("is-sending"), 150);
  }
}

sendBtn.addEventListener("click", sendMessage);

messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendMessage();
  }
});

/* ---------------------------------------------------
   Messages: diffed render so only new messages animate
--------------------------------------------------- */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function isNearBottom() {
  return messages.scrollHeight - messages.scrollTop - messages.clientHeight < 80;
}

function scrollToBottom() {
  messages.scrollTop = messages.scrollHeight;
}

function renderMessage(id, data, animate) {
  if (messageEls.has(id)) return;

  const div = document.createElement("div");
  div.classList.add("message", data.username === currentUser ? "me" : "other");
  if (animate) div.classList.add("msg-anim");

  div.innerHTML = `
    <strong>${escapeHtml(data.username)}</strong>
    <p>${escapeHtml(data.text)}</p>
  `;

  messages.appendChild(div);
  messageEls.set(id, div);
}

function loadMessages() {
  const q = query(
    collection(db, "rooms", currentRoom, "messages"),
    orderBy("createdAt")
  );

  unsubMessages = onSnapshot(q, (snapshot) => {
    emptyState.classList.toggle("hidden", !snapshot.empty);

    const wasNearBottom = isNearBottom();

    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        renderMessage(change.doc.id, change.doc.data(), initialLoadDone);
      } else if (change.type === "removed") {
        const el = messageEls.get(change.doc.id);
        if (el) el.remove();
        messageEls.delete(change.doc.id);
      }
    });

    if (!initialLoadDone) {
      initialLoadDone = true;
      scrollToBottom();
      return;
    }

    if (wasNearBottom) {
      scrollToBottom();
      jumpLatest.classList.add("hidden");
    } else {
      jumpLatest.classList.remove("hidden");
    }
  });
}

messages.addEventListener("scroll", () => {
  if (isNearBottom()) {
    jumpLatest.classList.add("hidden");
  }
});

jumpLatest.addEventListener("click", () => {
  scrollToBottom();
  jumpLatest.classList.add("hidden");
});

/* ---------------------------------------------------
   Typing presence
   (minimal collection: rooms/{room}/typing/{username})
--------------------------------------------------- */
function setTypingStatus(isTyping) {
  if (!currentRoom || !currentUser) return;
  setDoc(doc(db, "rooms", currentRoom, "typing", currentUser), {
    username: currentUser,
    typing: isTyping,
    updatedAt: Date.now()
  }).catch(() => {});
}

messageInput.addEventListener("input", () => {
  if (!currentRoom) return;
  setTypingStatus(true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => setTypingStatus(false), 2000);
});

function initTyping() {
  const typingCol = collection(db, "rooms", currentRoom, "typing");

  unsubTyping = onSnapshot(typingCol, (snapshot) => {
    const now = Date.now();
    const activeTypers = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.username === currentUser) return;
      if (data.typing && now - data.updatedAt < 4000) {
        activeTypers.push(data.username);
      }
    });

    if (activeTypers.length === 0) {
      typingIndicator.classList.add("hidden");
      return;
    }

    typingText.textContent =
      activeTypers.length === 1
        ? `${activeTypers[0]} is typing`
        : `${activeTypers.slice(0, 2).join(", ")} are typing`;

    typingIndicator.classList.remove("hidden");
  });
}

/* ---------------------------------------------------
   Online presence
   (minimal collection: rooms/{room}/presence/{username})
--------------------------------------------------- */
function initPresence() {
  const presenceRef = doc(db, "rooms", currentRoom, "presence", currentUser);
  const heartbeat = () => {
    setDoc(presenceRef, { username: currentUser, lastSeen: Date.now() }).catch(() => {});
  };

  heartbeat();
  presenceInterval = setInterval(heartbeat, 15000);

  const presenceCol = collection(db, "rooms", currentRoom, "presence");

  unsubPresence = onSnapshot(presenceCol, (snapshot) => {
    const now = Date.now();
    let onlineCount = 0;

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (now - data.lastSeen < 30000) onlineCount++;
    });

    presenceCount.innerHTML = `<span class="dot-online"></span>${onlineCount} online`;
  });
}

function markOffline() {
  if (!currentRoom || !currentUser) return;
  deleteDoc(doc(db, "rooms", currentRoom, "presence", currentUser)).catch(() => {});
}
  
