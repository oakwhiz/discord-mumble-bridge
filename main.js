var htmlToText = require('html-to-text');
var marked = require('marked');
var request = require('request');
const DataURI = require('datauri');
const datauri = new DataURI();
var sharp = require('sharp');
var dataUriToBuffer = require('data-uri-to-buffer');
//var streamBuffers = require('stream-buffers');



var Discord = require("discord.js");

var discordClient = new Discord.Client();


var mumble = require('mumble'),
    fs = require('fs');

//remember to generate a self-signed keypair in PEM format, using OpenSSL, before running
var options = {
    key: fs.readFileSync( 'key.pem' ),
    cert: fs.readFileSync( 'cert.pem' )
};


///////////////////
// Helper functions
///////////////////


///////////////////////
// Mumble functionality
///////////////////////

var sessions = {};
var channels = {};
var mumbleRootChannel = null;
var mumbleTargetChannel = null;
var mumbleConnection = null;

var mumbleConnect = function() {
    console.log( 'Mumble connecting' );
    mumble.connect( 'mumble://mumble.server.example.com', options, function ( error, connection ) {
        if( error ) {
            setTimeout(mumbleConnect, 5000);
            console.log( 'Mumble connection error' );
        } else {
            
            console.log( 'Mumble connected' );
        
            mumbleConnection = connection;
    
            connection.authenticate( 'BridgeBot' );
            connection.on( 'initialized', onInit );
            connection.on( 'ready', onReady );
            //connection.on( 'voice', onVoice );
            connection.on('message', onMessage);
            connection.on( 'userState', function (state) {
                sessions[state.session] = state;
            });
            connection.on( 'channelState', function (state) {
                channels[state.channelId] = state;
            });
        }
    });
};

var onInit = function() {
    console.log( 'Mumble connection initialized' );

    // Connection is authenticated and usable.
};

var onReady = function() {
    console.log( 'Mumble connection ready' );

    // Connection is ready (?)
    mumbleRootChannel = mumbleConnection.channelByPath("/");
    mumbleTargetChannel = mumbleConnection.channelByPath("/Mumble Room Here/");
    mumbleTargetChannel.join();
};

var onVoice = function( voice ) {
    //console.log( 'Mixed voice' );

    var pcmData = voice;
};

var onMessage = function(message,user,scope) {
    console.log( 'Mumble message' );
    //var user = sessions[actor];
    //var user = mumbleConnection.userBySession(actor);
    
    var relayMsg = user.name + " (Mumble/" + user.channel.name + "): <br />" + message;
 
    relayMsg = htmlToText.fromString(relayMsg, {
        wordwrap: false,
        ignoreImage: true
    });
    
    //console.log(relayMsg);
    discordClient.sendMessage(discordChannel, relayMsg);
    console.log( 'Mumble message sent, detecting attachments' );
    
    var imageRegexp = /<img\s+(?:.+?=.+?\s+)*src=(['"]?)(data:.+?)\1(?:\s+.+?=.+?)*\s*\/?\s*>/ig;
    var match = imageRegexp.exec(message);
    //console.log(message);
    if (match !== null) {
        console.log( 'Mumble message, attachment detected' );
        /*
        var attachment = new streamBuffers.ReadableStreamBuffer({
              frequency: 1,       // in milliseconds.
              chunkSize: 2048     // in bytes.
            }).put(dataUriToBuffer(match[2]));
        */
        var attachment = dataUriToBuffer(match[2]);
        console.log( 'Mumble message, sending attachment' );
        discordClient.sendFile(discordChannel, attachment);
        console.log( 'Mumble message, attachment sent' );
    }
};


////////////////////////
// Discord functionality
////////////////////////

var discordChannel = null;

discordClient.on("message", function(message){
    if (message.author != discordClient.user) {
        var relayMsg = null;
        console.log( 'Discord message' );
        var relayMsg = message.author.username + " (Discord/" + message.channel.name + '): \n' + message.cleanContent;
        relayMsg = marked(relayMsg);
        //relayMsg = relayMsg.replace(/\n/g, "<br />"); //fix line breaks
        mumbleConnection.user.channel.sendMessage(relayMsg);
        
        if (typeof message.attachments[0] !== 'undefined')	{			// Say the URL of an attachment (discord only permits one per message)
            const attachment = message.attachments[0];
            relayMsg = message.author.username + " (Discord/" + message.channel.name + ') posted an attachment: ' + attachment.url;
            relayMsg = marked(relayMsg);
            discordProcessMsgAttach(relayMsg, attachment.url);
        }
    } else {
        //console.log( 'Discord message from self ignored' );
    }
});

var discordProcessMsgAttach = function (relayMsg, attachUrl) {
    console.log( 'Discord attachment, requesting' );
    request({ url:attachUrl, encoding:null }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            console.log( 'Discord attachment, request success' );
            sharp(body).resize(320, null).jpeg().quality(40).toBuffer((err, buffer, info) => {
            //sharp(body).resize(128, null).png().compressionLevel(9).toBuffer((err, buffer, info) => {
                if (!err) {
                    console.log( 'Discord attachment, resize success: ' + info.size + " bytes" );
                    /*
                    datauri.format('.jpg', buffer, (err, content) => {
                      if (err) {
                          throw err;
                      }
                      console.log( 'Discord attachment, datauri success' );
                      mumbleConnection.user.channel.sendMessage(relayMsg + "<br /><img src=\"" + content + "\" />" );
                      console.log( 'Discord attachment, forwarding success' );
                    });*/
                    var attachDataUri = datauri.format('.jpg', buffer).content.toString(undefined);
                    //console.log( 'Discord attachment, datauri success: \n' + attachDataUri + "\n");
                    console.log( 'Discord attachment, datauri success');
                    mumbleConnection.user.channel.sendMessage(relayMsg + "<br /><img src=\"" + attachDataUri + "\"></img>" );
                    console.log( 'Discord attachment, forwarding success' );
                } else {
                    mumbleConnection.user.channel.sendMessage("ERROR: Attachment is not an image");
                }
            });
        } else {
            console.log( 'Discord attachment, request failed' );
        }
    });
};

discordClient.on("ready", function(){
    discordChannel = discordClient.channels.get("name", "room-name-here");
    //discordClient.joinVoiceChannel(discordChannel);
});

var discordConnect = function() {
    console.log( 'Discord connecting' );
    discordClient.login("address@email.example.com", "Pa55w0rd").then(discordConnectSuccess).catch(discordConnectErr);
    discordClient.setStatus("online")
};

var discordConnectErr = function() {
    setTimeout(discordConnect, 5000);
    console.log( 'Discord connection error' );
};

var discordConnectSuccess = function() {
    console.log( 'Discord connected' );
}

var discordFailNotice = function(failure) {
    console.log("Discord Failure Notice: " + failure)
    discordClient.sendMessage(discordChannel, failure);
}

discordConnect();
mumbleConnect();
