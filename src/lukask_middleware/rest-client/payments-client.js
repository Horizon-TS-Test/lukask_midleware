var restUrl = require('./../config/rest-api-url');
var Planilla = require('./../models/panillas');
var Client = require("node-rest-client").Client;
//Post para el servicio

var request = require("request");

//Ruta si fue un exito
var getExitoso = function (parametros, token, callback) {
    console.log("Ingreso al exitoso", parametros);
    var client = new Client();
    var payerID = parametros.params.PayerID;
    var paymentId = parametros.params.paymentId;

    //GET METHOD:
    var get = client.get(restUrl.checkout + '/checkout?paymentId=' + paymentId + '&token=' + token + '&PayerID=' + payerID + '', function (data, response) {
        callback(response.statusCode, data);
    });

    get.on("error", function (err) {
        console.log(err);
        callback(500, err.code);
    });
    ////
    ///////////////////////////////////////////////////////////////////////////////////////////////////////
};

//Ruta no fue un exito
var getCancelado = function (callback) {
    var get = client.get(restUrl.cancelado, args, function (data, response) {
        console.log(data);
        callback(response.statusCode, data);
    });

    get.on("error", function (err) {
        console.log(err);
        callback(500, err.code);
    });
    ////
    ///////////////////////////////////////////////////////////////////////////////////////////////////////
};


//POST PARA EL METODO DE RUBY
var postPay = function (body, token, callback) {
    var client = new Client();
    var args = {
        data: {
            "shopping_id": 1,
            "total": 1 * 100,
            "items": [{
                "name": "PAGO DEL SERVICIO " + body.empresa + "",
                "sku": body.factura,
                "price": 1,
                "currency": "USD",
                "quantity": 1
            }],
            "return_url": "http://192.168.1.42:3001/payment/exitoso",
            "cancel_url": "http://192.168.1.42:3001/payment/cancelado"
        },
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Token " + token
        }
    }

    var post = client.post(restUrl.pay, args, function (data, response) {
        callback(response.statusCode, data);
    });

    post.on("error", function (err) {
        callback(500, err.code);
    });
    ////

    ///////////////////////////////////////////////
};




//Tarjetas
var postCards = function (body, token, callback) {
    var client = new Client();
    var args = {
        data: {
            "shopping_id": "",
            "tarjeta": {
                "email": req.body.email,
                "number": req.body.card,
                "expire_month": mes,
                "expire_year": anio,
                "cvv2": req.body.cvv
            },
            "productos": {
                "total": req.session.cart.totalPrecio * 100,
                "items": [{
                    "name": "Back End",
                    "sku": "item",
                    "price": 1,
                    "currency": "USD",
                    "quantity": 1
                }],
                "return_url": "http://localhost:3001/exitoso",
                "cancel_url": "http://localhost:3001/carrito"
            }
        },
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Token " + token
        }
    }

    var post = client.post(restUrl.cards, args, function (data, response) {
        callback(response.statusCode, data);
    });

    post.on("error", function (err) {
        callback(500, err.code);
    });
    ////

    ///////////////////////////////////////////////
};

module.exports = {
    getExitoso: getExitoso,
    postPay: postPay,
    postCards: postCards,
    getCancelado: getCancelado
}