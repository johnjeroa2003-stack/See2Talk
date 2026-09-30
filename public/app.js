/* =========================================================
   SEE2TALK — GLOBAL CHAT + PEOPLE + PRIVATE CHAT
   Luxury floating UI
   Full frontend controller
========================================================= */

const socket = io();

/* =========================================================
   MAIN ELEMENTS
========================================================= */

const nameScreen = document.getElementById("nameScreen");
const nameForm = document.getElementById("nameForm");
const nameInput = document.getElementById("nameInput");
const chatApp = document.getElementById("chatApp");

const messages = document.getElementById("messages");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const typingIndicator = document.getElementById("typingIndicator");
const onlineCount = document.getElementById("onlineCount");

const leaveButton = document.getElementById("leaveButton");
const globalChatButton = document.getElementById("globalChatButton");

const emojiButton = document.getElementById("emojiButton");
const emojiMenu = document.getElementById("emojiMenu");

/* =========================================================
   PEOPLE PANEL
========================================================= */

const peopleButton = document.getElementById("peopleButton");
const mobilePeopleButton = document.getElementById("mobilePeopleButton");
const peopleOverlay = document.getElementById("peopleOverlay");
const closePeoplePanel = document.getElementById("closePeoplePanel");
const peopleSearchInput = document.getElementById("peopleSearchInput");
const clearPeopleSearch = document.getElementById("clearPeopleSearch");
const peopleList = document.getElementById("peopleList");
const noPeopleMessage = document.getElementById("noPeopleMessage");

/* =========================================================
   PRIVATE CHAT
========================================================= */

const privateChatOverlay = document.getElementById("privateChatOverlay");
const privateUserAvatar = document.getElementById("privateUserAvatar");
const privateUserName = document.getElementById("privateUserName");
const privateUserStatus = document.getElementById("privateUserStatus");
const closePrivateChat = document.getElementById("closePrivateChat");
const privateMessages = document.getElementById("privateMessages");
const privateTyping = document.getElementById("privateTyping");
const privateMessageForm = document.getElementById("privateMessageForm");
const privateMessageInput = document.getElementById("privateMessageInput");

/* =========================================================
   APPLICATION STATE
========================================================= */

let currentUserName = "";
let currentSocketId = "";

let allOnlineUsers = [];

let currentPrivateUser = null;

/*
  Structure:

  privateConversations = {
      socketId: {
          user: {...},
          messages: [],
          unread: 0
      }
  }
*/
let privateConversations = {};

let globalTypingUsers = new Set();

let globalTypingTimeout = null;
let privateTypingTimeout = null;

/* =========================================================
   BASIC HELPERS
========================================================= */

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getInitials(name) {
  const clean = String(name || "User").trim() || "User";

  const parts = clean.split(/\s+/);

  if (parts.length > 1) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  return clean.slice(0, 2).toUpperCase();
}

function getUserName(user) {
  if (!user) return "User";

  if (typeof user === "string") {
    return user;
  }

  return (
    user.userName || user.username || user.name || user.displayName || "User"
  );
}

function getUserSocketId(user) {
  if (!user || typeof user === "string") {
    return "";
  }

  return (
    user.socketId ||
    user.socketID ||
    user.id ||
    user.userId ||
    user.userSocketId ||
    ""
  );
}

function formatTime(timestamp) {
  const date = timestamp ? new Date(timestamp) : new Date();

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

/*
  Converts possible message objects into plain text.

  This prevents:

      [object Object]

  from appearing in the chat.
*/
function normalizeText(value) {
  if (value == null) {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(normalizeText).filter(Boolean).join(" ");
  }

  if (typeof value === "object") {
    return normalizeText(
      value.message ?? value.text ?? value.content ?? value.body ?? "",
    );
  }

  return "";
}

function showElement(element) {
  if (element) {
    element.classList.remove("hidden");
  }
}

function hideElement(element) {
  if (element) {
    element.classList.add("hidden");
  }
}

function scrollGlobalToBottom() {
  if (messages) {
    messages.scrollTop = messages.scrollHeight;
  }
}

function scrollPrivateToBottom() {
  if (privateMessages) {
    privateMessages.scrollTop = privateMessages.scrollHeight;
  }
}

/* =========================================================
   NAME / JOIN GLOBAL CHAT
========================================================= */

nameForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  const name = nameInput.value.trim();

  if (!name) {
    nameInput.focus();
    return;
  }

  currentUserName = name.slice(0, 24);

  showElement(chatApp);
  hideElement(nameScreen);

  socket.emit("joinGlobal", currentUserName);

  setTimeout(() => {
    messageInput?.focus();
  }, 150);
});

/* =========================================================
   SOCKET CONNECT
========================================================= */

socket.on("connect", () => {
  currentSocketId = socket.id;

  console.log("See2Talk connected:", currentSocketId);

  if (currentUserName) {
    socket.emit("joinGlobal", currentUserName);
  }
});

/* =========================================================
   ONLINE COUNT
========================================================= */

socket.on("onlineCount", (count) => {
  if (!onlineCount) return;

  onlineCount.textContent = `${Number(count) || 0} online`;
});

/* =========================================================
   GLOBAL CHAT — SEND MESSAGE
========================================================= */

messageForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  const text = messageInput.value.trim();

  if (!text) return;

  socket.emit("chatMessage", text);

  messageInput.value = "";

  stopGlobalTyping();

  messageInput.focus();
});

/* =========================================================
   SYSTEM MESSAGE
========================================================= */

socket.on("systemMessage", (data) => {
  const text = normalizeText(data?.text ?? data?.message);

  if (text) {
    addSystemMessage(text, data?.time);
  }
});

function addSystemMessage(text, timestamp) {
  if (!messages) return;

  const row = document.createElement("div");

  row.className = "system-message";

  row.innerHTML = `
    <span class="system-pill">
      <span class="system-spark">✦</span>
      ${escapeHTML(text)}
      <time>
        ${escapeHTML(formatTime(timestamp))}
      </time>
    </span>
  `;

  messages.appendChild(row);

  scrollGlobalToBottom();
}

/* =========================================================
   GLOBAL CHAT — RECEIVE MESSAGE
========================================================= */

socket.on("chatMessage", (data) => {
  if (!data) return;

  const senderName = getUserName(data);

  const senderSocketId =
    data.socketId ||
    data.senderSocketId ||
    data.fromSocketId ||
    data.userId ||
    data.senderId ||
    "";

  const text = normalizeText(
    data.message ?? data.text ?? data.content ?? data.body,
  );

  if (!text) return;

  addGlobalMessage(
    senderName,
    text,
    senderSocketId,
    data.timestamp || data.time || data.createdAt || Date.now(),
  );
});

/* =========================================================
   GLOBAL CHAT — RENDER MESSAGE
========================================================= */

function addGlobalMessage(senderName, text, senderSocketId, timestamp) {
  if (!messages) return;

  const isMine =
    senderSocketId === currentSocketId || senderName === currentUserName;

  const row = document.createElement("article");

  row.className = `global-message ${isMine ? "own-message" : "other-message"}`;

  const avatar = `
    <div
      class="message-avatar"
      aria-hidden="true"
    >
      ${escapeHTML(getInitials(senderName))}
      <span class="avatar-live-dot"></span>
    </div>
  `;

  const safeName = escapeHTML(senderName);

  const safeText = escapeHTML(text);

  const safeTime = escapeHTML(formatTime(timestamp));

  const identity = isMine
    ? `
      <div class="message-user-label own-user-label">
        <span class="user-name-text">
          You
        </span>

        <span class="user-live-dot"></span>
      </div>
    `
    : `
      <button
        type="button"
        class="message-user"
        data-socket-id="${escapeHTML(senderSocketId)}"
        data-user-name="${safeName}"
        title="Open private chat with ${safeName}"
      >
        <span class="user-name-text">
          ${safeName}
        </span>

        <span class="user-live-dot"></span>
      </button>
    `;

  row.innerHTML = `
    ${isMine ? "" : avatar}

    <div class="message-stack">

      <div
        class="message-meta-row ${isMine ? "mine-meta" : ""}"
      >

        ${identity}

        <time class="message-meta-time">
          ${safeTime}
        </time>

      </div>

      <div class="message-bubble">

        <span class="bubble-highlight"></span>

        <div class="message-text">
          ${safeText}
        </div>

        <div class="message-bottom">
          <span class="bubble-status">
            ${isMine ? "✓✓" : ""}
          </span>
        </div>

      </div>

    </div>

    ${isMine ? avatar : ""}
  `;

  messages.appendChild(row);

  requestAnimationFrame(scrollGlobalToBottom);
}

/* =========================================================
   CLICK USER NAME → PRIVATE CHAT
========================================================= */

messages?.addEventListener("click", (event) => {
  const button = event.target.closest(".message-user");

  if (!button) return;

  const socketId = button.dataset.socketId || "";

  const userName = button.dataset.userName || "User";

  if (!socketId || socketId === currentSocketId) {
    return;
  }

  const existing = allOnlineUsers.find(
    (user) => getUserSocketId(user) === socketId,
  );

  openPrivateChat(
    existing || {
      socketId,
      userName,
    },
  );
});

/* =========================================================
   GLOBAL TYPING
========================================================= */

messageInput?.addEventListener("input", () => {
  if (!messageInput.value.trim()) {
    stopGlobalTyping();
    return;
  }

  socket.emit("typing");

  clearTimeout(globalTypingTimeout);

  globalTypingTimeout = setTimeout(stopGlobalTyping, 1200);
});

function stopGlobalTyping() {
  clearTimeout(globalTypingTimeout);

  socket.emit("stopTyping");
}

socket.on("typing", (data) => {
  const name = typeof data === "string" ? data : getUserName(data);

  if (name && name !== currentUserName) {
    globalTypingUsers.add(name);

    updateGlobalTyping();
  }
});

socket.on("stopTyping", (data) => {
  const name = typeof data === "string" ? data : getUserName(data);

  if (name) {
    globalTypingUsers.delete(name);
  }

  updateGlobalTyping();
});

function updateGlobalTyping() {
  if (!typingIndicator) return;

  const names = [...globalTypingUsers];

  if (!names.length) {
    typingIndicator.textContent = "";

    return;
  }

  typingIndicator.textContent =
    names.length === 1
      ? `${names[0]} is typing...`
      : `${names.length} people are typing...`;
}

/* =========================================================
   ONLINE USERS
========================================================= */

function normalizeUsers(list) {
  if (!Array.isArray(list)) {
    return [];
  }

  return list

    .map((user) => {
      if (typeof user === "string") {
        return {
          userName: user,
          socketId: "",
        };
      }

      return {
        ...user,

        userName: getUserName(user),

        socketId: getUserSocketId(user),
      };
    })

    .filter((user) => {
      return (
        getUserName(user) &&
        getUserName(user) !== currentUserName &&
        getUserSocketId(user) !== currentSocketId
      );
    });
}

/* =========================================================
   RECEIVE ONLINE USERS
========================================================= */

socket.on("onlineUsers", (data) => {
  const list = Array.isArray(data)
    ? data
    : data?.users || data?.onlineUsers || [];

  allOnlineUsers = normalizeUsers(list);

  renderPeopleList();

  if (currentUserName) {
    updateDisplayedOnlineCount();
  }
});

/* =========================================================
   USER JOINED
========================================================= */

socket.on("userJoined", (data) => {
  const user = {
    ...data,

    userName: getUserName(data),

    socketId: getUserSocketId(data),
  };

  if (
    user.userName &&
    user.userName !== currentUserName &&
    !allOnlineUsers.some(
      (existing) =>
        getUserSocketId(existing) === user.socketId ||
        getUserName(existing) === user.userName,
    )
  ) {
    allOnlineUsers.push(user);
  }

  renderPeopleList();

  updateDisplayedOnlineCount();
});

/* =========================================================
   USER LEFT
========================================================= */

socket.on("userLeft", (data) => {
  const id = getUserSocketId(data);

  const name = getUserName(data);

  allOnlineUsers = allOnlineUsers.filter(
    (user) => getUserSocketId(user) !== id && getUserName(user) !== name,
  );

  renderPeopleList();

  updateDisplayedOnlineCount();

  if (
    currentPrivateUser &&
    (currentPrivateUser.socketId === id || currentPrivateUser.userName === name)
  ) {
    if (privateUserStatus) {
      privateUserStatus.innerHTML = `<span class="private-offline-dot"></span> Offline`;
    }
  }
});

function updateDisplayedOnlineCount() {
  if (!onlineCount) return;

  const count = allOnlineUsers.length + (currentUserName ? 1 : 0);

  onlineCount.textContent = `${count} online`;
}

/* =========================================================
   PEOPLE PANEL
========================================================= */

function openPeoplePanel() {
  renderPeopleList();

  showElement(peopleOverlay);

  setTimeout(() => {
    peopleSearchInput?.focus();
  }, 100);
}

function closePeoplePanelFunction() {
  hideElement(peopleOverlay);

  if (peopleSearchInput) {
    peopleSearchInput.value = "";
  }

  hideElement(clearPeopleSearch);

  renderPeopleList();
}

peopleButton?.addEventListener("click", openPeoplePanel);

mobilePeopleButton?.addEventListener("click", openPeoplePanel);

closePeoplePanel?.addEventListener("click", closePeoplePanelFunction);

peopleOverlay?.addEventListener("click", (event) => {
  if (event.target === peopleOverlay) {
    closePeoplePanelFunction();
  }
});

peopleSearchInput?.addEventListener("input", () => {
  if (peopleSearchInput.value.trim()) {
    showElement(clearPeopleSearch);
  } else {
    hideElement(clearPeopleSearch);
  }

  renderPeopleList();
});

clearPeopleSearch?.addEventListener("click", () => {
  peopleSearchInput.value = "";

  hideElement(clearPeopleSearch);

  renderPeopleList();

  peopleSearchInput.focus();
});

/* =========================================================
   RENDER PEOPLE LIST
========================================================= */

function renderPeopleList() {
  if (!peopleList) return;

  const query = (peopleSearchInput?.value || "").trim().toLowerCase();

  const users = allOnlineUsers

    .filter((user) => getUserName(user).toLowerCase().includes(query))

    .sort((a, b) => getUserName(a).localeCompare(getUserName(b)));

  peopleList.innerHTML = "";

  if (!users.length) {
    hideElement(peopleList);

    showElement(noPeopleMessage);

    return;
  }

  showElement(peopleList);

  hideElement(noPeopleMessage);

  users.forEach((user) => {
    const socketId = getUserSocketId(user);

    const name = getUserName(user);

    const convo = privateConversations[socketId];

    const unread = convo?.unread || 0;

    const last = convo?.messages?.at(-1);

    const button = document.createElement("button");

    button.type = "button";

    button.className = "people-user";

    button.dataset.socketId = socketId;

    button.dataset.userName = name;

    button.innerHTML = `

      <div class="people-user-avatar">

        ${escapeHTML(getInitials(name))}

        <span class="people-user-status-dot"></span>

      </div>

      <div class="people-user-info">

        <div class="people-user-name">
          ${escapeHTML(name)}
        </div>

        <div class="people-user-status">
          ${escapeHTML(last?.text || "Online now")}
        </div>

      </div>

      ${
        unread
          ? `
            <span class="people-unread-badge">
              ${unread > 9 ? "9+" : unread}
            </span>
          `
          : ""
      }

      <div class="people-user-arrow">
        ›
      </div>
    `;

    button.addEventListener("click", () => {
      openPrivateChat(user);
    });

    peopleList.appendChild(button);
  });
}

/* =========================================================
   OPEN PRIVATE CHAT
========================================================= */

function openPrivateChat(user) {
  if (!user) return;

  const socketId = getUserSocketId(user);

  const userName = getUserName(user);

  if (
    !socketId ||
    socketId === currentSocketId ||
    userName === currentUserName
  ) {
    return;
  }

  currentPrivateUser = {
    ...user,

    socketId,
    userName,
  };

  if (!privateConversations[socketId]) {
    privateConversations[socketId] = {
      user: currentPrivateUser,

      messages: [],

      unread: 0,
    };
  }

  privateConversations[socketId].user = currentPrivateUser;

  privateConversations[socketId].unread = 0;

  if (privateUserAvatar) {
    privateUserAvatar.textContent = getInitials(userName);
  }

  if (privateUserName) {
    privateUserName.textContent = userName;
  }

  if (privateUserStatus) {
    privateUserStatus.innerHTML = `<span class="private-online-dot"></span> Online`;
  }

  renderPrivateMessages();

  closePeoplePanelFunction();

  showElement(privateChatOverlay);

  setTimeout(() => {
    privateMessageInput?.focus();

    scrollPrivateToBottom();
  }, 80);
}

/* =========================================================
   CLOSE PRIVATE CHAT
========================================================= */

function closePrivateChatFunction() {
  hideElement(privateChatOverlay);

  currentPrivateUser = null;

  if (privateMessageInput) {
    privateMessageInput.value = "";
  }

  if (privateTyping) {
    privateTyping.textContent = "";
  }
}

closePrivateChat?.addEventListener("click", closePrivateChatFunction);

/* =========================================================
   PRIVATE CHAT — SEND MESSAGE
========================================================= */

privateMessageForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!currentPrivateUser) {
    return;
  }

  const text = privateMessageInput.value.trim();

  if (!text) return;

  /*
      Send to server.
    */
  socket.emit("privateMessage", {
    targetSocketId: currentPrivateUser.socketId,

    message: text,
  });

  privateMessageInput.value = "";

  stopPrivateTyping();

  privateMessageInput.focus();
});

/* =========================================================
   PRIVATE CHAT — RECEIVE MESSAGE
========================================================= */

/*
  IMPORTANT FIX

  The server sends the private message to:

      A → B
      B → A

  AND the sender receives an echo.

  Therefore, when YOU receive your own echo,
  senderSocketId is YOUR socket ID.

  We must NOT create a conversation using
  YOUR socket ID.

  Instead, the message belongs to the currently
  selected user's conversation.
*/

socket.on("privateMessage", (data) => {
  if (!data) return;

  /* -----------------------------------------------
       Read possible server property names
    ------------------------------------------------ */

  const senderSocketId =
    data.senderSocketId ||
    data.fromSocketId ||
    data.senderId ||
    data.socketId ||
    data.userId ||
    "";

  const targetSocketId =
    data.targetSocketId ||
    data.toSocketId ||
    data.recipientSocketId ||
    data.targetId ||
    "";

  const senderName =
    data.senderName || data.userName || data.name || data.displayName || "User";

  const text = normalizeText(
    data.message ?? data.text ?? data.content ?? data.body,
  );

  if (!text) return;

  /* -----------------------------------------------
       Is this OUR OWN message?
    ------------------------------------------------ */

  const mine =
    senderSocketId === currentSocketId || senderName === currentUserName;

  /* -----------------------------------------------
       FIND THE CORRECT CONVERSATION
    ------------------------------------------------ */

  let conversationId = "";

  if (mine) {
    /*
        OUR OWN MESSAGE

        IMPORTANT:
        Do NOT use our own socket ID.

        Use the person currently selected.
      */

    conversationId = currentPrivateUser?.socketId || targetSocketId || "";
  } else {
    /*
        OTHER USER'S MESSAGE

        Their socket ID identifies the conversation.
      */

    conversationId = senderSocketId || "";
  }

  /* -----------------------------------------------
       FALLBACK
    ------------------------------------------------ */

  if (!conversationId && currentPrivateUser) {
    conversationId = currentPrivateUser.socketId;
  }

  if (!conversationId) {
    return;
  }

  /* -----------------------------------------------
       TIMESTAMP
    ------------------------------------------------ */

  const timestamp = data.timestamp || data.time || data.createdAt || Date.now();

  /* -----------------------------------------------
       BUILD MESSAGE
    ------------------------------------------------ */

  const message = {
    text,

    senderName: mine ? currentUserName : senderName,

    senderSocketId: mine ? currentSocketId : senderSocketId,

    targetSocketId: mine
      ? currentPrivateUser?.socketId || targetSocketId
      : currentSocketId,

    timestamp,

    mine,
  };

  /* -----------------------------------------------
       CREATE CONVERSATION IF NEEDED
    ------------------------------------------------ */

  if (!privateConversations[conversationId]) {
    privateConversations[conversationId] = {
      user: mine
        ? currentPrivateUser || {
            socketId: conversationId,

            userName: "User",
          }
        : {
            socketId: conversationId,

            userName: senderName,
          },

      messages: [],

      unread: 0,
    };
  }

  /* -----------------------------------------------
       UPDATE USER
    ------------------------------------------------ */

  if (!privateConversations[conversationId].user) {
    privateConversations[conversationId].user = mine
      ? currentPrivateUser
      : {
          socketId: conversationId,

          userName: senderName,
        };
  }

  /* -----------------------------------------------
       DUPLICATE PROTECTION
    ------------------------------------------------ */

  const existingMessages = privateConversations[conversationId].messages || [];

  const duplicate = existingMessages.some((existing) => {
    const existingTime = new Date(existing.timestamp).getTime();

    const newTime = new Date(timestamp).getTime();

    return (
      existing.text === message.text &&
      existing.senderName === message.senderName &&
      Math.abs(existingTime - newTime) < 3000
    );
  });

  if (!duplicate) {
    privateConversations[conversationId].messages.push(message);
  }

  /* -----------------------------------------------
       KEEP LAST 200 MESSAGES
    ------------------------------------------------ */

  privateConversations[conversationId].messages =
    privateConversations[conversationId].messages.slice(-200);

  /* -----------------------------------------------
       IS THIS CHAT CURRENTLY OPEN?
    ------------------------------------------------ */

  const active =
    !!currentPrivateUser && currentPrivateUser.socketId === conversationId;

  /* -----------------------------------------------
       ACTIVE CHAT
    ------------------------------------------------ */

  if (active) {
    /*
        THIS FIX MAKES YOUR OWN MESSAGE
        APPEAR IMMEDIATELY.
      */

    renderPrivateMessages();

    requestAnimationFrame(scrollPrivateToBottom);
  } else if (!mine) {
    /* -----------------------------------------------
       MESSAGE FROM OTHER USER
    ------------------------------------------------ */
    privateConversations[conversationId].unread =
      (privateConversations[conversationId].unread || 0) + 1;

    const user = privateConversations[conversationId].user;

    if (user) {
      openPrivateChat(user);
    }
  }

  renderPeopleList();
});

/* =========================================================
   RENDER PRIVATE MESSAGES
========================================================= */

function renderPrivateMessages() {
  if (!privateMessages || !currentPrivateUser) {
    return;
  }

  privateMessages.innerHTML = "";

  const conversation = privateConversations[currentPrivateUser.socketId];

  if (
    !conversation ||
    !conversation.messages ||
    !conversation.messages.length
  ) {
    privateMessages.innerHTML = `

      <div class="private-empty-state">

        <div class="private-empty-icon">
          ✦
        </div>

        <strong>
          Start a private conversation
        </strong>

        <span>
          Messages here are between you
          and ${escapeHTML(currentPrivateUser.userName)}.
        </span>

      </div>

    `;

    return;
  }

  conversation.messages.forEach((message) => {
    const mine = message.mine || message.senderName === currentUserName;

    const row = document.createElement("div");

    row.className = `private-message-row ${
      mine ? "private-own-message" : "private-other-message"
    }`;

    const displayName = mine
      ? "You"
      : message.senderName || currentPrivateUser.userName;

    const safeText = escapeHTML(normalizeText(message.text ?? message.message));

    const safeName = escapeHTML(displayName);

    const safeTime = escapeHTML(formatTime(message.timestamp));

    row.innerHTML = `

        <div class="private-message-wrap">

          <div class="private-message-meta">

            <strong>
              ${safeName}
            </strong>

            <time>
              ${safeTime}
            </time>

          </div>

          <div class="private-message-bubble">

            <span class="bubble-highlight"></span>

            <div class="private-message-text">
              ${safeText}
            </div>

            <div class="private-message-time">
              ${mine ? "✓✓" : ""}
            </div>

          </div>

        </div>

      `;

    privateMessages.appendChild(row);
  });

  requestAnimationFrame(scrollPrivateToBottom);
}

/* =========================================================
   PRIVATE TYPING
========================================================= */

privateMessageInput?.addEventListener("input", () => {
  if (!currentPrivateUser) {
    return;
  }

  if (!privateMessageInput.value.trim()) {
    stopPrivateTyping();

    return;
  }

  socket.emit("privateTyping", {
    targetSocketId: currentPrivateUser.socketId,
  });

  clearTimeout(privateTypingTimeout);

  privateTypingTimeout = setTimeout(stopPrivateTyping, 1200);
});

function stopPrivateTyping() {
  clearTimeout(privateTypingTimeout);

  if (currentPrivateUser) {
    socket.emit("privateStopTyping", {
      targetSocketId: currentPrivateUser.socketId,
    });
  }
}

socket.on("privateTyping", (data) => {
  const name = data?.senderName || data?.userName || data?.name || "User";

  if (
    currentPrivateUser &&
    (data?.senderSocketId === currentPrivateUser.socketId ||
      name === currentPrivateUser.userName)
  ) {
    if (privateTyping) {
      privateTyping.textContent = `${name} is typing...`;
    }
  }
});

socket.on("privateStopTyping", () => {
  if (privateTyping) {
    privateTyping.textContent = "";
  }
});

/* =========================================================
   EMOJI MENU
========================================================= */

emojiButton?.addEventListener("click", (event) => {
  event.stopPropagation();

  emojiMenu?.classList.toggle("hidden");
});

emojiMenu?.addEventListener("click", (event) => {
  const button = event.target.closest("button");

  if (!button) return;

  messageInput.value += button.textContent;

  messageInput.focus();
});

document.addEventListener("click", (event) => {
  if (
    emojiMenu &&
    !emojiMenu.contains(event.target) &&
    event.target !== emojiButton
  ) {
    emojiMenu.classList.add("hidden");
  }
});

/* =========================================================
   GLOBAL CHAT BUTTON
========================================================= */

globalChatButton?.addEventListener("click", () => {
  closePeoplePanelFunction();

  closePrivateChatFunction();

  messageInput?.focus();
});

/* =========================================================
   LEAVE CHAT
========================================================= */

leaveButton?.addEventListener("click", () => {
  if (!confirm("Are you sure you want to leave See2Talk?")) {
    return;
  }

  socket.emit("leaveGlobal");

  socket.disconnect();

  currentUserName = "";

  currentPrivateUser = null;

  privateConversations = {};

  allOnlineUsers = [];

  hideElement(chatApp);

  showElement(nameScreen);

  if (nameInput) {
    nameInput.value = "";

    nameInput.focus();
  }
});

/* =========================================================
   ESCAPE KEY
========================================================= */

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (peopleOverlay && !peopleOverlay.classList.contains("hidden")) {
    closePeoplePanelFunction();

    return;
  }

  if (privateChatOverlay && !privateChatOverlay.classList.contains("hidden")) {
    closePrivateChatFunction();

    return;
  }

  emojiMenu?.classList.add("hidden");
});

/* =========================================================
   REFRESH ONLINE USERS
========================================================= */

setInterval(() => {
  if (socket.connected) {
    socket.emit("getOnlineUsers");
  }
}, 5000);

/* =========================================================
   INITIAL UI STATE
========================================================= */

hideElement(chatApp);

hideElement(peopleOverlay);

hideElement(privateChatOverlay);

hideElement(clearPeopleSearch);

console.log("See2Talk luxury frontend loaded.");
