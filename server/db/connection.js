const mongoose = require('mongoose');

const url = `mongodb+srv://baolektmt:rS090uPd5faGhkMT@cluster0.rmz3pyj.mongodb.net/chat-app`;

mongoose.connect(url, {
    useNewUrlParser: true, 
    useUnifiedTopology: true
}).then(() => console.log('Connected to DB')).catch((e)=> console.log('Error', e))  
