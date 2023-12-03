const express = require("express");
const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const mongoose = require("mongoose");
const io = require("socket.io")(8080, {
  cors: {
    origin: "http://localhost:3000",
  },
});
const url = `mongodb+srv://baolektmt:rS090uPd5faGhkMT@cluster0.rmz3pyj.mongodb.net/laptrinhmang_chatApp`;
// Connect DB
mongoose
  .connect(url)
  .then(() => {
    console.log("Connected to the database!");
  })

  .catch((err) => {
    console.log("Cannot connect to the database!", err);
    process.exit(); 
  });

// Import Files
const Users = require('./models/Users');
const Conversations = require('./models/Conversations');
const Messages = require('./models/Messages');

// app Use
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());

const port = process.env.PORT || 8000;

// Socket.io
let users = [];
let userCheck = [];
io.on('connection', socket => {
    console.log('User connected to the server: ', socket.id);
    socket.on('addUser', async userId => {
        const checkuser = await Users.findById(userId);
        nameUser = checkuser.fullName; 
        emailUser = checkuser.email;
        const isUserExist = users.find(user => user.userId === userId);
        if (!isUserExist) {
            console.log('User added to app chat: ', socket.id);
            const user = { userId, nameUser, emailUser, socketId: socket.id };
            users.push(user);
            io.emit('getUsers', users);
        }
    });

    socket.on('UserLogin', async data => {
        const checkUser = await Users.findOne({email:data.email});
        const userId = checkUser._id;
        const stringUserId = userId.toString();
        const isUserLogin = userCheck.find(user => user.toString() === stringUserId);
        if(isUserLogin){
            console.log('User already exists');
            io.to(socket.id).emit('checkUserLogin', { messageFromServer: 'User already exists' });
        }
        else if(userCheck.length > 1){
            console.log('Full User');
            io.to(socket.id).emit('checkUserLogin', { messageFromServer: 'Full User' });
        }else{ 
            console.log('UserLogin :>> ', data);
            //console.log('socket id:', socket.id)
            userCheck.push(userId);
            console.log('userCheck Lenght when login:>> ', userCheck);
            const { email, password } = data;
            const msg = await Login(email, password);
            io.to(socket.id).emit('checkUserLogin', msg);
        }
        //console.log('Length of user :>> ', userCheck.length);
    }); 

    const Login = async (email, password) => {
        try {
            let messageFromServer = '';
    
            if (!email || !password) {
                messageFromServer = "Please fill all required fields";
                return { messageFromServer };
            }
    
            const user = await Users.findOne({ email });
    
            if (!user) {
                messageFromServer = 'User is not exist';
                return { messageFromServer };
            }
    
            const validateUser = await bcryptjs.compare(password, user.password);
    
            if (!validateUser) {
                messageFromServer = 'User password is incorrect';
                return { messageFromServer };
            }
    
            const payload = {
                userId: user._id,
                email: user.email,
            };
    
            const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || 'THIS_IS_A_JWT_SECRET_KEY';
            const token = await new Promise((resolve, reject) => {
                jwt.sign(payload, JWT_SECRET_KEY, { expiresIn: 84600 }, (err, token) => {
                    if (err) reject(err);
                    resolve(token);
                });
            });
    
            await Users.updateOne({ _id: user._id }, { $set: { token } });
    
            const dataReturn = {
                user: { id: user._id, email: user.email, fullName: user.fullName },
                token,
                messageFromServer: 'User login successfully',
            };
    
            return dataReturn;
        } catch (error) {
            console.error("Error during login:", error);
            return { messageFromServer: 'Error during login' };
        }
    };

    socket.on('UserRegister', async data => {
        console.log('UserRegister :>> ', data);  
        console.log('socket id:', socket.id)
        const { fullName, email, password } = data;
        const msg = await Register(fullName, email, password);
        console.log('msg :>> ', msg);
        io.to(socket.id).emit('checkUserRegister', msg);
        if(msg == 'User registered successfully'){
            io.emit('getUsers', users);
        }
    }); 

    const Register = async (fullName, email, password) => {
        let messageFromServer = '';
     
        if (!fullName || !email || !password) {
            messageFromServer = "Please fill all required fields";
        } else {
            try {
                const isAlreadyExist = await Users.findOne({ email });
    
                if (isAlreadyExist) { 
                    messageFromServer = 'User already exists'; 
                } else {
                    const newUser = new Users({ fullName, email });
     
                    // Hashing the password using bcryptjs
                    const hashedPassword = await bcryptjs.hash(password, 10);
                    newUser.set('password', hashedPassword);
                    await newUser.save();
                    // Call the next middleware or complete the request-response cycle
                    messageFromServer = 'User registered successfully';
                }
            } catch (error) {
                // Handle any errors that occur during the asynchronous operations
                console.error("Error during registration:", error);
                messageFromServer = 'Error during registration';
            }
        }
    
        return messageFromServer;
    };


    socket.on('logout', async userId => {
        console.log('UserLogout :>> ', userId);
        const msg = 'User logout successfully';
    
        const stringUserId = userId.toString();
    
        userCheck = userCheck.filter(user => user.toString() !== stringUserId);
    
        console.log('userCheck Length when logout:>> ', userCheck);
    
        io.to(socket.id).emit('logoutUser', msg);
    });

    socket.on('sendMessage', async ({ senderId, receiverId, message, conversationId }) => {
        const receiver = users.find(user => user.userId === receiverId);
        const sender = users.find(user => user.userId === senderId);
        const user = await Users.findById(senderId);
        console.log('sender :>> ', sender, receiver);    
        if (receiver) {
            io.to(receiver.socketId).to(sender.socketId).emit('getMessage', {
                senderId,
                message,
                conversationId,
                receiverId,
                user: { id: user._id, fullName: user.fullName, email: user.email }
            });
            }else {
                io.to(sender.socketId).emit('getMessage', {
                    senderId,
                    message,
                    conversationId,
                    receiverId,
                    user: { id: user._id, fullName: user.fullName, email: user.email }
                });
            }
        });

    socket.on('disconnect', () => {
        console.log('User disconnected', socket.id);
        users = users.filter(user => user.socketId !== socket.id);
        io.emit('getUsers', users);
    });
    //io.emit('getUsers', socket.userId);
});

// Routes
app.get('/', (req, res) => {
    res.send('Welcome');
})

app.post('/api/conversation', async (req, res) => {
    try {
        const { senderId, receiverId } = req.body;
        const newCoversation = new Conversations({ members: [senderId, receiverId] });
        await newCoversation.save();
        res.status(200).send('Conversation created successfully');
    } catch (error) {
        console.log(error, 'Error')
    }
})

app.get('/api/conversations/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const conversations = await Conversations.find({ members: { $in: [userId] } });
        const conversationUserData = Promise.all(conversations.map(async (conversation) => {
            const receiverId = conversation.members.find((member) => member !== userId);
            const user = await Users.findById(receiverId);
            return { user: { receiverId: user._id, email: user.email, fullName: user.fullName }, conversationId: conversation._id }
        }))
        res.status(200).json(await conversationUserData);
    } catch (error) {
        console.log(error, 'Error')
    }
})

app.post('/api/message', async (req, res) => {
    try {
        const { conversationId, senderId, message, receiverId = '' } = req.body;
        if (!senderId || !message) return 'Please fill all required fields'
        if (conversationId === 'new' && receiverId) {
            const newCoversation = new Conversations({ members: [senderId, receiverId] });
            await newCoversation.save();
            const newMessage = new Messages({ conversationId: newCoversation._id, senderId, message });
            await newMessage.save();
            return res.status(200).send('Message sent successfully');
        } else if (!conversationId && !receiverId) {
            return res.status(400).send('Please fill all required fields')
        }
        const newMessage = new Messages({ conversationId, senderId, message });
        await newMessage.save();
        res.status(200).send('Message sent successfully');
    } catch (error) {
        console.log(error, 'Error')
    }
})

app.get('/api/message/:conversationId', async (req, res) => {
    try {
        const checkMessages = async (conversationId) => {
            console.log(conversationId, 'conversationId')
            const messages = await Messages.find({ conversationId });
            const messageUserData = Promise.all(messages.map(async (message) => {
                const user = await Users.findById(message.senderId);
                return { user: { id: user._id, email: user.email, fullName: user.fullName }, message: message.message }
            }));
            res.status(200).json(await messageUserData);
        }
        const conversationId = req.params.conversationId;
        if (conversationId === 'new') {
            const checkConversation = await Conversations.find({ members: { $all: [req.query.senderId, req.query.receiverId] } });
            if (checkConversation.length > 0) {
                checkMessages(checkConversation[0]._id);
            } else {
                return res.status(200).json([])
            }
        } else {
            checkMessages(conversationId);
        }
    } catch (error) {
        console.log('Error', error)
    }
})

app.get('/api/users/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const users = await Users.find({ _id: { $ne: userId } });
        const usersData = Promise.all(users.map(async (user) => {
            return { user: { email: user.email, fullName: user.fullName, receiverId: user._id } }
        }))
        res.status(200).json(await usersData);
    } catch (error) {
        console.log('Error', error)
    } 
})


app.listen(port, () => {
    console.log('listening on port ' + port);
})