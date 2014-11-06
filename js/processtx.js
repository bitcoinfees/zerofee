var minFeeRate = 0.00001000;
var minPriority = 0.576;
var minFeeReference = 'https://github.com/bitcoin/bitcoin/blob/v0.9.3/src/main.cpp#L55';
var minPriorityReference = 'https://github.com/bitcoin/bitcoin/blob/v0.9.3/src/main.h#L299'; 
var provider = 'helloblock.io';

function TxParser(tx) {
  switch (provider) {
    case 'helloblock.io':
      this.txobj = txobj = tx.transaction;
      this.txid = txobj.txHash;
      this.confirmations = txobj.confirmations;
      this.vin = txobj.inputs;
      this.size = txobj.size;
      this.numInputs = txobj.inputsCount;
      this.numOutputs = txobj.outputsCount;
      this.getScriptSig = function (vinput) {
        return vinput.scriptSig;
      };
      this.getPrevTxOutIdx = function(vinput) {
        return vinput.prevTxoutIndex;
      };
      this.getPrevTxOutID = function(vinput) {
        return vinput.prevTxHash;
      };
      this.getOutputAmount = function(n) {
        return this.txobj.outputs[n].value / 1e8;
      };
  }
}

switch (provider) {
  case 'helloblock.io':
    TxParser.baseurl = "https://mainnet.helloblock.io/v1/transactions/";
    TxParser.prettyurl = "https://helloblock.io/transactions/";
    TxParser.homepage = "https://helloblock.io"
}

function processTx(tx) {
  var dPriority = 0;
  var inputAmounts = 0;
  var fees = 0;
  var feeRate = 0;
  var isOrphan = false;
  var nTxSize = tx.size;
  var modTxSize = nTxSize;
  var url;
  var orphanDeps = [];

  // For each tx input, fetch the prev tx and compute various stats
  var countdown = tx.numInputs;
  var getJSONfail = false;
  
  tx.vin.forEach(function(vinput) {
    // Calculate modified size for priority.
    // https://github.com/bitcoin/bitcoin/blob/v0.9.3/src/core.cpp#L121
    var offset = 41 + Math.min(110, tx.getScriptSig(vinput).length/2);
    if (modTxSize > offset)
      modTxSize -= offset;    

    url = TxParser.baseurl + tx.getPrevTxOutID(vinput);
    var req = $.getJSON(url, function(res) {
      prevoutTx = new TxParser(res.data);
      var n = tx.getPrevTxOutIdx(vinput);
      var amount = prevoutTx.getOutputAmount(n);

      if (prevoutTx.confirmations === 0) {
        isOrphan = true;
        orphanDeps.push(prevoutTx.txid);
      }
      dPriority += amount*prevoutTx.confirmations;
      inputAmounts += amount;
    });   

    req.fail(function() {
      getJSONfail = true;
    });

    req.always(function() {
      if (--countdown === 0) 
        complete();
    });
  });

  var complete = function() {
    $('.spinner').hide();
    if (getJSONfail)
      appendText('Oops looks like there is an unknown problem, sorry.')
    else {
      dPriority /= modTxSize;
      fees = inputAmounts;

      for(n = 0; n < tx.numOutputs; n++) {
        fees -= tx.getOutputAmount(n);
      }

      fees = Math.max(0,fees);
      feeRate = fees / nTxSize * 1000;      

      appendText('This transaction has a fee rate of <b>' + feeRate.toFixed(8) + ' BTC per KB</b>.<br>');

      if (feeRate >= minFeeRate) {
        appendText('This is greater than <a href=' + minFeeReference + '>0.00001000</a> BTC, so it probably qualifies as a <b>paid</b> transaction, and should be confirmed soon.<br>');
      } else if (feeRate > 0) {
        appendText('This is less than <a href=' + minFeeReference + '> 0.00001000</a> BTC, so it probably counts as a <b>zero-fee</b> transaction.<br>');
      }
      appendText('<br>');

      if (feeRate < minFeeRate) {
        appendText('The transaction has a priority value of <b>' + dPriority.toFixed(8) + '</b>, and needs to be above <a href=' + minPriorityReference +'>' + minPriority + '</a> to qualify for a free transaction.<br>');
        if (dPriority > minPriority) {
          appendText('Thus it qualifies for a free transaction and should be confirmed soon.<br><br>')
        } else {
          var priorityDelta = (inputAmounts/modTxSize*144);
          var daysLeft = (minPriority-dPriority)/priorityDelta;
          appendText('Its priority value will increase by about <b>' + priorityDelta.toFixed(8) + '</b> per day;<br>');
          appendText('It will qualify in about <b>' + daysLeft.toFixed(1) + '</b> days.<br><br>')
          if (!isOrphan && daysLeft > 30) {
            appendText('Remember to include a fee next time :)<br><br>');
          }
        }
      }
      if (isOrphan) {
        appendText('However, this transaction has <b>' + orphanDeps.length + ' unconfirmed input' + ((orphanDeps.length > 1) ? 's':'') + '</b>, so its confirmation time will depend on those transaction(s) being confirmed first.<br><br>');        
      }
      appendText('<a href=' + TxParser.prettyurl + tx.txid + '>Link to transaction</a><br><br>')
    }
  }
}