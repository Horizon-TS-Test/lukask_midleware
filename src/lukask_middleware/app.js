var express = require('express');

////////USED TO STORE SESSION INSIDE REDIS SERVER:////////
var redis = require('redis');
var session = require('express-session');
var redisStore = require('connect-redis')(session);

var redisAuth = require('./config/redis_auth');
//////////////////////////////////////////////////////////

var servers = require("./config/websocket-servers");

var secret_dir = require('./config/secret');
var backend_cred = require('./config/credentials');
const exp_time = 900;
//const exp_time = 60;
const def_exp_time = 86400;
const aux_prefij = 'auxex_';

var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

///////////////////////////ROUTES://///////////////////////
//var index = require('./routes/index');
//var users = require('./routes/users');
var restcli = require('./routes/restapi-client');
var todocli = require('./routes/todos');
var logincli = require('./routes/login');
var logoutcli = require('./routes/logout');
///////////////////////////////////////////////////////////

/////////////////////CRYPTO GENERATOR//////////////////////
var cryptoGen = require('./tools/crypto-generator');
///////////////////////////////////////////////////////////

////////USED TO STORE SESSION INSIDE REDIS SERVER://///////
var redisClient = redis.createClient({host: redisAuth.host, port: redisAuth.port, password: redisAuth.password});
///////////////////////////////////////////////////////////
var app = express();
var server = require("http").Server(app);
var io = require("socket.io")(server);

// view engine setup
app.set('views', path.join(__dirname, 'views'));
//app.set('view engine', 'pug');
app.set('view engine', 'hbs');

////////USED TO STORE SESSION INSIDE REDIS SERVER:////////
var sessionMiddleware = session({
  secret: secret_dir.secret_key,
  //NEXT CREATES A NEW REDIS STORE:
  store: new redisStore({
    host: redisAuth.host,
    port: redisAuth.port,
    pass: redisAuth.password,
    client: redisClient,
    //NEXT LINE IS COMMENTED TO PUBLISH KEY EXPIRATION EVENT WITH A CUSTOM PROCEDURE
    //ttl: 9000 //seconds
  }),
  /////////////////////////////////
  saveUninitialized: false,
  resave: false
});
app.use(sessionMiddleware);
//////////////////////////////////////////////////////////

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: false, limit: '50mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'node_modules')));


//////////////////////////////////////// ENABLE CORS: ////////////////////////////////////////////
//TO ENSURE OUR FRONT END CLIENT COULD REACH THIS MIDDLEWARE SERVER:
app.use(function (req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', servers.allow_origin);
  //res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, Content-Length, X-Requested-With, Content-Type, Accept, X-Access-Token');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  //PREFLIGHT REQUEST HACKED:
  //REF: https://vinaygopinath.me/blog/tech/enable-cors-with-pre-flight/
  if ('OPTIONS' == req.method) {
    res.sendStatus(200);
  } else {
    next();
  }
});
//////////////////////////////////////////////////////////////////////////////////////////////////

//MIDDLEWARE METHOD USED TO ENSURE USERS MUST BE LOGGED FIRST:

var midGetClient = redis.createClient({host: redisAuth.host, port: redisAuth.port, password: redisAuth.password});
var midSetClient = redis.createClient({host: redisAuth.host, port: redisAuth.port, password: redisAuth.password});
app.use(function (req, res, next) {
  //REF: https://stackoverflow.com/questions/12525928/how-to-get-request-path-with-express-req-object
  if (req.originalUrl.indexOf('login') === -1 && req.originalUrl.indexOf('logout') === -1) {
    console.log("Express sessions controling middleware");

    if (!req.session.key) {
      return res.status(401).json({
        code: 401,
        title: "Not Authenticated",
        data: "You must be logged first."
      });
    }

    let localEncrypted = req.session.key.crypto_user_id;
    //let userEncrypted = req.query.userId;
    //REF: https://scotch.io/tutorials/authenticate-a-node-js-api-with-json-web-tokens
    let userEncrypted = req.headers['x-access-token'];

    console.log("userEncrypted", cryptoGen.decrypt(userEncrypted));
    console.log("localEncrypted", cryptoGen.decrypt(localEncrypted));

    if (!(localEncrypted.content === userEncrypted.content && cryptoGen.decrypt(localEncrypted) === cryptoGen.decrypt(userEncrypted))) {
      return res.status(401).json({
        title: "Not Authorized",
        data: "Invalid user credentials"
      });
    }

    //REDIS SESSION TTL RESTARTING:
    redisClient.keys("sess:*", function (error, keys) {
      for (let key of keys) {
        midGetClient.get(key, function (err, reply) {
          let keyData = JSON.parse(reply);
          if (keyData.key) {
            if (keyData.key.crypto_user_id == req.session.key.crypto_user_id) {
              //REF: https://dzone.com/articles/tutorial-working-nodejs-and
              midSetClient.expire(key, def_exp_time);
              midSetClient.expire(aux_prefij + key, exp_time);
            }
          }
        });
      }
    });
    ////
  }

  next();
});
////

//SOCKET.IO MIDDLEWARE TO LINK EXPRESS STATUS AND SESSION WITH SOCKET.IO STATUS:
io.use(function (socket, next) {
  sessionMiddleware(socket.request, {}, next);
});

io.use(function (socket, next) {
  console.log("Socket.io middleware!!");

  //REF: https://stackoverflow.com/questions/35249770/how-to-get-all-the-sockets-connected-to-socket-io
  Object.keys(io.sockets.sockets).forEach(function (id) {
    console.log("Socket ID: ", id);
  });

  if (!socket.request.session.key) {
    console.log("A client tried to connect without have logged first, now forcing logout");
    socket.force_logout = true;
  }
  else {
    console.log("Authenticated user has connected, Socket ID: ", socket.id);
  }

  next();
});
////////////////////////////////////////////////////////////////////

//app.use('/', index);
//app.use('/users', users);
app.use('/logout', logoutcli);
app.use('/restcli', restcli);
app.use('/todos', todocli);
app.use('/login', logincli);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});


//////////////////////////////////////////////REDIS PUB/SUB////////////////////////////////////////////
var pubsubClient = redis.createClient({host: redisAuth.host, port: redisAuth.port, password: redisAuth.password});
var settingClient = redis.createClient({host: redisAuth.host, port: redisAuth.port, password: redisAuth.password});
var gettingClient = redis.createClient({host: redisAuth.host, port: redisAuth.port, password: redisAuth.password});

var EVENT_SET = '__keyevent@0__:set';
var EVENT_DEL = '__keyevent@0__:del';
var EVENT_EXPIRED = '__keyevent@0__:expired';

//__keyevent@0__:expired EVENT CONFIGURATION ON REDIS:
pubsubClient.config("SET", "notify-keyspace-events", "Ex");
////
//__keyevent@0__:set AND __keyevent@0__:del EVENTS CONFIGURATION ON REDIS:
pubsubClient.config("SET", "notify-keyspace-events", "KEA");
////

pubsubClient.on('message', function (channel, key) {
  switch (channel) {
    case EVENT_SET:
      if (key.indexOf(aux_prefij) == -1) {
        //REF: https://github.com/NodeRedis/node_redis/issues/1000
        settingClient.set(aux_prefij + key, '', 'EX', exp_time);
      }
      console.log('Key "' + key + '" set!');
      break;
    case EVENT_DEL:
      console.log('Key "' + key + '" deleted!');
      if (key.indexOf(aux_prefij) === -1) {
        settingClient.del(aux_prefij + key);
      }
      break;
    case EVENT_EXPIRED:
      console.log('Key "' + key + '" expired!');
      let indi = 0;

      if (key.indexOf(aux_prefij) !== -1) {
        gettingClient.get(key.replace(aux_prefij, ""), function (err, reply) {
          let keyData = JSON.parse(reply);
          if (keyData.key) {
            //SEARCHING FOR SOCKET WITH EXPIRED USER ID TO NOTIFY ABOUT SESSION EXPIRATION:
            console.log("N sockets: ", Object.keys(io.sockets.sockets).length);
            //REF: https://stackoverflow.com/questions/35249770/how-to-get-all-the-sockets-connected-to-socket-io
            Object.keys(io.sockets.sockets).forEach(function (id) {
              if (io.sockets.connected[id].request.session.key) {
                if (io.sockets.connected[id].request.session.key.crypto_user_id === keyData.key.crypto_user_id) {
                  console.log("Session expired. Socket ID: ", id);
                  io.sockets.connected[id].emit('force_logout', 'Your session has expired. Echo from server.');
                  //REF: https://stackoverflow.com/questions/42064870/socket-io-disconnection-on-logout-and-network-out
                  io.sockets.connected[id].disconnect();
                  settingClient.del(key.replace(aux_prefij, ''));
                  indi = 1;
                }
              }
            });
            if (indi == 0) {
              settingClient.del(key.replace(aux_prefij, ''));
            }
            ////
          }
        });
      }
      break;
  }
});

pubsubClient.subscribe(EVENT_SET, EVENT_DEL, EVENT_EXPIRED);
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////USING SOCKET.IO//////////////////////////////////////////////
io.on("connection", function (socket) {
  if (socket.force_logout) {
    socket.emit('force_logout', 'You has been kicked from the server. Echo from server.');
    //REF: https://stackoverflow.com/questions/42064870/socket-io-disconnection-on-logout-and-network-out
    socket.disconnect();
  }

  //IMPLEMENTATION TO SAVE SOCKET CLIENTS ON AN ARRAY (DEPRECATED):
  /*socket.on("auth", function (data) {
    let localEncrypted = socket.request.session.key.crypto_user_id;
    //REF: https://stackoverflow.com/questions/25083564/socket-io-parameters-on-connection
    //let socketEncrypted = socket.handshake.query._;
    let socketEncrypted = data.user_id;

    console.log("socketEncrypted", cryptoGen.decrypt(socketEncrypted));
    console.log("localEncrypted", cryptoGen.decrypt(localEncrypted));

    if (!(localEncrypted.content === socketEncrypted.content && cryptoGen.decrypt(localEncrypted) === cryptoGen.decrypt(socketEncrypted))) {
      console.log("Invalid user credentials... forcing logout socket with ID: ", socket.id);
      socket.emit('force_logout', 'You has been kicked from the server. Echo from server.');
      socket.disconnect();
    }
    else {
      console.log("User has logged in, Socket ID: ", socket.id);
      socket.auth = true;
    }
  });

  //TO ENSURE CLIENT HAS NOT AUTHENTICATED:
  setTimeout(function() {
    if (socket.auth == false) {
      console.log("User has never authenticated... forcing disconnect socket with ID: ", socket.id);
      socket.disconnect();
    }
  }, 1000);*/
  ////

  /*socket.on("notification", function (data) {
    //client.emit("server-rules", data);
    client.broadcast.emit("server-rules", data);
  });*/

  socket.on("disconnect", function (data) {
    console.log("Socket has been disconnected: ", data);
  });
});
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//SOCKET WITH EXPRESS GENERATOR:
//REF: https://medium.com/@suhas_chitade/express-generator-with-socket-io-80464341e8ba
//TO SHARE SOCKET INSTANCE TO EXPRESS ROUTES:
app.use(function (req, res, next) {
  req.io = io;
  next();
});
////

//////////USING WEBSOCKET CLIENT OF PYTHON CONNECTION//////////

/*var WebSocketClient = require("websocket").w3cwebsocket;

var webSocketClient = new WebSocketClient("ws://10.0.2.2:8080/api/", "echo-protocol", "http://10.0.2.2:8080");

webSocketClient.onerror = function(error) {
  console.log("Channels APi Websocket Connection Error", error);
};

webSocketClient.onopen = function() {
  console.log("Channels APi Websocket Client connected");

  //SUBSCRIPTION:
  var msg = {
    stream: "todos",
    payload: {
      action: "subscribe",
      data: {
        action: "update"
      }
    }
  };

  webSocketClient.send(JSON.stringify(msg));
    
  msg = {
    stream: "todos",
    payload: {
      action: "subscribe",
      data: {
        action: "delete"
      }
    }
  }

  webSocketClient.send(JSON.stringify(msg));
  ////
};

webSocketClient.onclose = function() {
  console.log("Channels APi Websocket echo-protocol Client Closed");
};

webSocketClient.onmessage = function(e) {
  console.log("Channels APi Websocket data received: '" + e.data + "'");

  //REF: https://stackoverflow.com/questions/8281382/socket-send-outside-of-io-sockets-on
  io .sockets.emit("broad", "Channels APi Websocket data received: '" + e.data + "'");
};*/

var WebSocketClient = require('websocket').client;

var client = new WebSocketClient();

client.on('connectFailed', function (error) {
  console.log('Channels API Websocket Connect Error: ' + error.toString());
});

client.on('connect', function (connection) {
  console.log('Channels API Websocket client connected');

  connection.on('error', function (error) {
    console.log("Channels API Websocket Connection Error: " + error.toString());
  });

  //SUBSCRIPTION:
  var msg = {
    stream: "todos",    
    payload: {
      action: "subscribe",
      data: {
        action: "create",
      }
    }
  };

  connection.send(JSON.stringify(msg));

  var msg = {
    stream: "todos",
    payload: {
      action: "subscribe",
      data: {
        action: "update"
      }
    }
  };

  connection.send(JSON.stringify(msg));

  msg = {
    stream: "todos",
    payload: {
      action: "subscribe",
      data: {
        action: "delete"
      }
    }
  }

  connection.send(JSON.stringify(msg));
  ////

  connection.on('message', function (message) {
    if (message.type === 'utf8') {
      console.log("Channels API Websocket data received: ", JSON.parse(message.utf8Data));
      // SOCKET.IO CLIENTS LOGGED CONTROL:
      //REF: https://stackoverflow.com/questions/35249770/how-to-get-all-the-sockets-connected-to-socket-io
      Object.keys(io.sockets.sockets).forEach(function (id) {
        console.log("Sending data to socket with ID: ", id)  // socketId
        if (io.sockets.connected[id].request.session.key) {
          //REF: https://stackoverflow.com/questions/8281382/socket-send-outside-of-io-sockets-on
          io.sockets.connected[id].emit("backend-rules", JSON.parse(message.utf8Data));
        }
      })
      ////
    }
  });

  connection.on('close', function () {
    console.log('Channels API Websocket echo-protocol Connection Closed');
  });
});

client.connect('ws://' + servers.backend_websocket + '/api', "", "http://" + servers.tornado_websocket);

///////////////////////////////////////////////////////////////

////////////////////////////CLIENT FROM PYTHON'S TORNADO WEBSOCKET/////////////////////
/*var WebSocketClient = require("websocket").w3cwebsocket;

var TornadoWebSocketClient = new WebSocketClient("ws://10.0.2.2:9432/ws/ws_pubsub", "echo-protocol", "http://10.0.2.2:9432");

TornadoWebSocketClient.onerror = function() {
  console.log("Tornado Websocket Connection Error");
};

TornadoWebSocketClient.onopen = function() {
  console.log("Tornado Websocket Client connected");
};

TornadoWebSocketClient.onclose = function() {
  console.log("Tornado Websocket echo-protocol Client Closed");
};

TornadoWebSocketClient.onmessage = function(e) {
  console.log("Tornado Websocket data received: '" + e.data + "'");

  //REF: https://stackoverflow.com/questions/8281382/socket-send-outside-of-io-sockets-on
  io.sockets.emit("broad", "Tornado Websocket data received: '" + e.data + "'");
};*/

var WebSocketClient = require('websocket').client;

var client = new WebSocketClient();

client.on('connectFailed', function (error) {
  console.log('Tornado Websocket Connect Error: ' + error.toString());
});

client.on('connect', function (connection) {
  console.log('Tornado Websocket client connected');

  connection.on('error', function (error) {
    console.log("Tornado Websocket Error: " + error.toString());
  });

  // TORNADO WEBSOCKET AUTHENTICTION PROCESS:
  connection.send(JSON.stringify({ event: "middle_auth", data: { token: backend_cred.backend_cli_token }}));
  ////
  
  connection.on('message', function (message) {
    if (message.type === 'utf8') {
      console.log("Tornado Websocket data received: ", JSON.parse(message.utf8Data));
      // SOCKET.IO CLIENTS LOGGED CONTROL:
      //REF: https://stackoverflow.com/questions/35249770/how-to-get-all-the-sockets-connected-to-socket-io
      Object.keys(io.sockets.sockets).forEach(function (id) {
        console.log("Sending data to socket with ID: ", id)  // socketId
        if (io.sockets.connected[id].request.session.key) {
          //REF: https://stackoverflow.com/questions/8281382/socket-send-outside-of-io-sockets-on
          io.sockets.connected[id].emit("dbserver-rules", JSON.parse(message.utf8Data));
        }
      })
      ////
    }
  });

  connection.on('close', function () {
    console.log('Tornado Websocket echo-protocol Connection Closed');
  });
});

client.connect('ws://' + servers.tornado_websocket + '/ws/ws_db_pubsub', "", "http://" + servers.tornado_websocket);
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//SOCKET WITH EXPRESS GENERATOR:
//REF: https://medium.com/@suhas_chitade/express-generator-with-socket-io-80464341e8ba
module.exports = { app: app, server: server };
////