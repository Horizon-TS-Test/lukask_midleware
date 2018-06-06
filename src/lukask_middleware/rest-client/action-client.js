var restUrl = require('./../config/rest-api-url');

var Client = require("node-rest-client").Client;

////////////////// MULTIPART/FORM-DATA REQUESTS /////////////////////
var request = require('request');
/////////////////////////////////////////////////////////////////////

////////////////////// FILE MANAGER ////////////////////////
var fs = require("fs");
////////////////////////////////////////////////////////////

var getActions = function (pubId, typeAction, limit, pagePattern, token, callback) {
    ///////////////////////////////////////////NODE-REST-CLIENT///////////////////////////////////////
    var client = new Client();
    var queryFilter = "?publication__id_publication=" + pubId + "&type_action__id_type_action=" + typeAction;
    limit = ((limit) ? "&limit=" + limit : "");
    var get;

    //GET METHOD:
    var args = {
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Token " + token
        }
    }

    if (pagePattern) {
        get = client.get(restUrl.action + queryFilter + pagePattern, args, function (data, response) {
            if (data.next) {
                data.next = "&" + data.next.substring(data.next.indexOf("?") + 1, data.next.indexOf("&", data.next.indexOf("&") + 1));
            }
            console.log(data);
            callback(response.statusCode, data);
        });
    }
    else {
        get = client.get(restUrl.action + queryFilter + limit, args, function (data, response) {
            if (data.next) {
                data.next = "&" + data.next.substring(data.next.indexOf("?") + 1, data.next.indexOf("&", data.next.indexOf("&") + 1));
            }
            console.log(data);
            callback(response.statusCode, data);
        });
    }

    get.on("error", function (err) {
        console.log(err);
        callback(500, err);
    });
    ////

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
}

var postAction = function (body, file, token, callback) {
    ////////////////////////////////// POST REQUEST //////////////////////////////////////
    var r = request.post(
        {
            url: restUrl.action,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": "Token " + token
            }
        }, function optionalCallback(err, httpResponse, data) {
            if (err) {
                console.log('Error while making todo post request: ', err);
                callback(httpResponse.statusCode, err);
            }
            if (httpResponse.statusCode == 201) {
                if (file) {
                    console.log("Eliminando archivo: " + file.path);
                    fs.unlink(file.path);
                }
                console.log('Action has been created successfully, Server responded with: ', JSON.parse(data));
                callback(httpResponse.statusCode, JSON.parse(data));
            }
            else {
                console.log('Error while making todo post request: ', data);
                callback(httpResponse.statusCode, data);
            }
        });

    var form = r.form();
    form.append('description', body.description);
    form.append('type_action', body.action_type);
    form.append('publication', body.id_publication);
    form.append('action_parent', body.action_parent);

    if (file) {
        form.append('format_multimedia', (file.mimetype.indexOf("image") != -1) ? "IG" : "FL");
        form.append('name_file', file.originalname);
        form.append('media_file', fs.createReadStream(file.path), { filename: file.originalname, contentType: file.mimetype });
    }
    //////////////////////////////////////////////////////////////////////////////////////
}

/*var getPub = function (id, token, callback) {
    ///////////////////////////////////////////NODE-REST-CLIENT///////////////////////////////////////
    var client = new Client();
 
    //GET METHOD:
    var args = {
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Token " + token
        }
    }
 
    var get = client.get(restUrl.pub + id + "/", args, function (data, response) {
        console.log(data);
        callback(response.statusCode, data);
    });
 
    get.on("error", function (err) {
        console.log(err);
        callback(500, err);
    });
    ////
 
    ///////////////////////////////////////////////////////////////////////////////////////////////////////
}*/

module.exports = {
    getActions: getActions,
    postAction: postAction,
    //getPub: getPub,
    /*patchTodo: patchTodo,
    deleteTodo: deleteTodo*/
}