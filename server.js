const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

/*
  ============================================================
  SEE2TALK USER STORAGE
  ============================================================
*/

const users = new Map();

/*
  users structure:

  socket.id => {
    name: "John",
    socketId: "abc123"
  }
*/

/*
  ============================================================
  EXPRESS
  ============================================================
*/

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "See2Talk",
  });
});

/*
  ============================================================
  SOCKET.IO
  ============================================================
*/

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  /*
    ==========================================================
    GLOBAL CHAT - JOIN
    ==========================================================
  */

  socket.on("joinGlobal", (rawName) => {
    const name = String(rawName || "")
      .trim()
      .slice(0, 24);

    if (!name) return;

    users.set(socket.id, {
      name: name,
      socketId: socket.id,
    });

    socket.data.name = name;

    /*
      Welcome message to the person who joined
    */

    socket.emit("systemMessage", {
      text: `Welcome to Global Chat, ${name}!`,
      time: Date.now(),
    });

    /*
      Tell everyone else that someone joined
    */

    socket.broadcast.emit("userJoined", {
      name: name,
      socketId: socket.id,
      onlineCount: users.size,
    });

    /*
      Update online count
    */

    io.emit("onlineCount", users.size);

    /*
      Send current online users
      to the new user
    */

    const onlineUsers = [];

    users.forEach((user, socketId) => {
      if (socketId !== socket.id) {
        onlineUsers.push({
          name: user.name,
          socketId: socketId,
        });
      }
    });

    socket.emit("onlineUsers", onlineUsers);
  });

  /*
    ==========================================================
    GLOBAL CHAT - MESSAGE
    ==========================================================
  */

  socket.on("chatMessage", (rawMessage) => {
    const user = users.get(socket.id);

    if (!user) return;

    const message = String(rawMessage || "")
      .trim()
      .slice(0, 500);

    if (!message) return;

    io.emit("chatMessage", {
      id: `${socket.id}-${Date.now()}`,

      name: user.name,

      socketId: socket.id,

      message: message,

      time: Date.now(),
    });
  });

  /*
    ==========================================================
    TYPING INDICATOR - GLOBAL CHAT
    ==========================================================
  */

  socket.on("typing", () => {
    const user = users.get(socket.id);

    if (!user) return;

    socket.broadcast.emit("typing", {
      name: user.name,
      socketId: socket.id,
    });
  });

  socket.on("stopTyping", () => {
    const user = users.get(socket.id);
    if (!user) return;

    socket.broadcast.emit("stopTyping", {
      name: user.name,
      socketId: socket.id,
    });
  });

  /*
    ==========================================================
    PRIVATE CHAT
    ==========================================================
    
    A user can send a private message directly
    to another online user.
  */

  socket.on("privateMessage", (data) => {
    if (!data) return;

    const sender = users.get(socket.id);

    if (!sender) return;

    const targetSocketId = String(data.targetSocketId || "");

    const message = String(data.message || "")
      .trim()
      .slice(0, 1000);

    if (!targetSocketId || !message) {
      return;
    }

    /*
      Check whether target user is actually online.
    */

    const targetUser = users.get(targetSocketId);

    if (!targetUser) {
      socket.emit("privateMessageError", {
        message: "This user is no longer online.",
      });

      return;
    }

    /*
      Private message object
    */

    const privateMessage = {
      id: `private-${Date.now()}-${Math.random()}`,

      senderSocketId: socket.id,

      senderName: sender.name,

      receiverSocketId: targetSocketId,

      receiverName: targetUser.name,

      message: message,

      time: Date.now(),
    };

    /*
      Send ONLY to the selected user.
    */

    io.to(targetSocketId).emit("privateMessage", privateMessage);

    /*
      Also send the message back to sender
      so their own private chat updates.
    */

    socket.emit("privateMessage", privateMessage);
  });

  /*
    ==========================================================
    PRIVATE TYPING INDICATOR
    ==========================================================
  */

  socket.on("privateTyping", (data) => {
    if (!data) return;

    const targetSocketId = String(data.targetSocketId || "");

    const sender = users.get(socket.id);

    if (!sender) return;

    if (!users.has(targetSocketId)) {
      return;
    }

    io.to(targetSocketId).emit("privateTyping", {
      senderSocketId: socket.id,
      senderName: sender.name,
    });
  });

  /*
    ==========================================================
    STOP PRIVATE TYPING
    ==========================================================
  */

  socket.on("privateStopTyping", (data) => {
    if (!data) return;

    const targetSocketId = String(data.targetSocketId || "");

    if (!users.has(targetSocketId)) {
      return;
    }

    io.to(targetSocketId).emit("privateStopTyping", {
      senderSocketId: socket.id,
    });
  });

  /*
    ==========================================================
    REQUEST ONLINE USER
    ==========================================================
  */

  socket.on("getOnlineUsers", () => {
    const onlineUsers = [];

    users.forEach((user, socketId) => {
      onlineUsers.push({
        name: user.name,

        socketId: socketId,
      });
    });

    socket.emit("onlineUsers", onlineUsers);
  });

  socket.on("leaveGlobal", () => {
    const user = users.get(socket.id);
    if (!user) return;

    users.delete(socket.id);

    socket.broadcast.emit("userLeft", {
      name: user.name,
      socketId: socket.id,
    });

    io.emit("onlineCount", users.size);
    io.emit(
      "onlineUsers",
      Array.from(users.entries()).map(([socketId, u]) => ({
        name: u.name,
        socketId,
      })),
    );
  });

  /*
    ==========================================================
    DISCONNECT
    ==========================================================
  */

  socket.on("disconnect", () => {
    const user = users.get(socket.id);

    users.delete(socket.id);

    if (user) {
      /*
        Tell everyone that this person left.
      */

      socket.broadcast.emit("userLeft", {
        name: user.name,
        socketId: socket.id,
      });

      /*
        Update online count.
      */

      io.emit("onlineCount", users.size);

      /*
        Update online user list.
      */

      io.emit(
        "onlineUsers",
        Array.from(users.entries()).map(([socketId, user]) => ({
          name: user.name,
          socketId: socketId,
        })),
      );
    }

    console.log("User disconnected:", socket.id);
  });
});

/*
  ============================================================
  START SERVER
  ============================================================
*/

server.listen(PORT, () => {
  console.log(`See2Talk running at http://localhost:${PORT}`);
});
