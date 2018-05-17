require('../styles/ChatApp.css');

import React from 'react';
import io from 'socket.io-client';
import config from '../config';

import Messages from './Messages';
import ChatInput from './ChatInput';

const https = require('https'); //HTTPS for IEX get request.

//given a message, return a comma-separated list of stock prices found within, for use with IEX API.
//note: stock symbols like AIG+ refer to warrants belonging to AIG, so we only care about letter-only stock codes.
const stockPrices = function(message){
  var words = message.split(' '); // look at each individual word in the message
  var stocksymbols = '';
  var added = []; // keep track of all the symbols we have run into, we don't need to do multiple lookups.
    for(var i = 0; i < words.length; i++){
      var symbol = words[i].slice(1);
      if(words[i].charAt(0) === '$' && /^[a-z]+$/i.test(symbol)){ // if word starts with $ and the symbol is made of letters it might be a stock price
        if(added.indexOf(symbol) > -1)
          continue // we have seen this symbol already, no need to do duplicate lookups for it.
        if(stocksymbols!='')
          stocksymbols+=','+symbol;
        else
          stocksymbols+=symbol;
        added.push(symbol);
      }
    }
  return stocksymbols;
}

//given a JSON of stock data, make a message to be sent via chat to show prices.
const StockBot = function(symbols, data){
  var symbols = symbols.split(','); // find each individual symbol, to be used in reporting which prices we didn't find
  var notfound = false;
  var found = false;
  var message = '';
  for(var i = 0; i < data.length; i++){
    if(!data[i].symbol){ // one of the symbols we were given was not found in the IEX system.
      notfound = true;
      continue;
    }
    found = true;
    message = message + data[i].symbol + ': $' + data[i].price + '\n';
    // we found a price for this symbol, remove it from the yet-to-be-found list
    symbols.splice(symbols.indexOf(data[i].symbol), 1);
  }
  if(found)
    message = 'Last traded prices for the stocks I found (USD):\n' + message;
  if(notfound)
    message = message + 'I was not able to find prices for: ' + symbols + '. Be sure to check your spelling!'
  return message;
}

class ChatApp extends React.Component {
  socket = {};
  constructor(props) {
    super(props);
    this.state = { messages: [] };
    this.sendHandler = this.sendHandler.bind(this);
    
    // Connect to the server
    this.socket = io(config.api, { query: `username=${props.username}` }).connect();

    // Listen for messages from the server
    this.socket.on('server:message', message => {
      this.addMessage(message);
    });
  }

  sendHandler(message) {
    const messageObject = {
      username: this.props.username,
      message
    };

    // Emit the message to the server
    this.socket.emit('client:message', messageObject);

    messageObject.fromMe = true;
    this.addMessage(messageObject);
  }

  // message object API = {message: '', username: '', fromMe: false}

  addMessage(message) {
    // Append the message to the component state
    const messages = this.state.messages;
    messages.push(message);

    // if the message wasn't sent by stockbot, we check it for stock prices
    if(message.username !== 'StockBot'){
      var prices = stockPrices(message.message); // check the message for stock prices, and collect them if they exist.
      if(prices){ // if we found some symbols
        var url = 'https://api.iextrading.com/1.0/tops/last?symbols='+prices;
        https.get(url, (resp) => { // make the get request
          let data = ''; // we let the data stream in as it comes.

          resp.on('data', (chunk) => {
            data+=chunk;
          });

          resp.on('end', () => {
            data = JSON.parse(data); // parse the data we have received.
            var messageContents = StockBot(prices, data); // pass the data to StockBot for output formatting into the text conversation.
            var stockbotmessage = {
              message: messageContents,
              username: 'StockBot',
              fromMe: false
            }
            this.addMessage(stockbotmessage); //now we add the message from stockbot.
          })
        })
      }
    }
    this.setState({ messages }); //regardless of if symbols were found, we update the state for the text.
  }

  render() {
    return (
      <div className="container">
        <h3>React Chat App</h3>
        <Messages messages={this.state.messages} />
        <ChatInput onSend={this.sendHandler} />
      </div>
    );
  }

}
ChatApp.defaultProps = {
  username: 'Anonymous'
};

export default ChatApp;