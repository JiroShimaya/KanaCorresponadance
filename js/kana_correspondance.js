//kuromojiのtokenizerによる形態素解析結果を少し修正して返す
function tokenize(text, tokenizer){
  if(!text)return [];

  const result = [];
  let tokens = tokenizer.tokenize(text);
  tokens = tokens.map(token=>{
    let surface = token.surface_form;
    //あとで一括で処理するため、発音が定義されていなければ、surfaceを代入しておく
    if(!token.pronunciation){
      token.pronunciation=surface;
    }
    return token;
  });
  
  return tokens;
}

//表層形のかな部分とそれ以外を分割し、タグを付けて返す。
function kanaTokenize (text) {
  //例外処理。万が一空文字であれば空のリストを返す
  if(text == "") return [];

  //正規表現の宣言
  //let re = /(?<kata>[ァ-ヴー]+)|(?<hira>[ぁ-ゔー]+)|(?<nonkana>[^ぁ-ゔァ-ヴー]+)/g //カタカナ、ひらがな、カナ以外にグループマッチ
  let re = new RegExp("(?<kata>[ァ-ヴー]+)|(?<hira>[ぁ-ゔー]+)|(?<nonkana>[^ぁ-ゔァ-ヴー]+)","g");
  //マッチする文字列を種類とともに取得
  let match = text.matchAll(re);
  match = [...match].map(m=>m.groups);
  let output = match.map(m=>{
    let token = {}
    for(let type in m){
      if(m[type]){
        token = {"surface":m[type],"type":type}
        break;
      }
    }
    return token;
  });
  
  return output;
}

//ひらがなをカタカナに変換
function hiraToKata (str) {
    return str.replace(/[\u3041-\u3096]/g, function(match) {
        var chr = match.charCodeAt(0) + 0x60;
        return String.fromCharCode(chr);
    });
}

function kanaAllocate (separated_surface, pronunciation) {
  //例外処理。万が一表層形の長さが0のとき、空の配列を返す
  if(separated_surface.length == 0) return [];
  
  //カナ始まりかどうかを取得
  let first_kana_index = 1;
  if(separated_surface[0]["type"] != "nonkana")
    first_kana_index = 0;
  let first_nonkana_index = (1-first_kana_index);

  let output = []
  let rest_text = pronunciation;
  
  for(let i=0;i<separated_surface.length;i++){
    //surfaceのカナ部分がpronunciationのどこから始まっているかを取得
    let type = separated_surface[i]["type"]
    let surface = separated_surface[i]["surface"]
    
    if(type == "nonkana") continue;

    let katakana = surface;
    if(type == "hira") katakana = hiraToKata(surface);

    let start = rest_text.indexOf(katakana);
    //カナ部分の始まりが途中からだったら、始めのカナ以外の部分を先に格納する
    if(start > 0){
      let nonkana = separated_surface[i-1]
      output.push({"surface":nonkana["surface"],"pronunciation":rest_text.slice(0,start-rest_text.length), "type":nonkana["type"]});
      rest_text = rest_text.slice(start);
    }
    //カナ部分の終わりまでを、格納する
    output.push({"surface":surface,"pronunciation":rest_text.slice(0,katakana.length),"type":type});
    rest_text = rest_text.slice(katakana.length);
  }
  //ループを終えてもカナ以外の部分が残っていたら追加する
  if(rest_text != ""){//rest_textが空文字とならないのはsurfaceがカナ以外で終わるとき
    let last = separated_surface[separated_surface.length-1];
    output.push({"surface":last["surface"], "pronunciation":rest_text,"type":last["type"]});
  }
  return output;
}

//辞書ベースで、漢字（熟語)と発音のなるべく細かい対応を見つける
//pronunciationはsurfaceよりも長い必要あり
function kanjiAllocate (surface, pronunciation, kanji_dict = {}) {
  let rest_text = pronunciation;
  let skipped_char = "";

  let output = [];
  for(let i=0;i<surface.length;i++){
    let char = surface[i];
    if(char in kanji_dict == false){
      skipped_char += char;
      continue;
    }

    let yomi_candidates = kanji_dict[char];//長さの降順にソート済みとする
    let start = -1;
    let yomi = "";
    for(let y of yomi_candidates){
      start = rest_text.indexOf(y);
      if(start >= 0){
        yomi = y;
        break;
      }
    }
    //マッチする読みが見つからなければスキップ
    if(start == -1){
      skipped_char += char;
      continue;
    }
    if(start > 0){
      if(output.length == 0){
        if(skipped_char != ""){
          output.push([skipped_char, rest_text.slice(0,start)]);
          skipped_char = "";
          rest_text = rest_text.slice(start);
          output.push([char, yomi]);
          rest_text = rest_text.slice(yomi.length);
        }else{
          output.push([char, rest_text.slice(0, start+yomi.length)]);
          rest_text = rest_text.slice(start+yomi.length);
        }
      }else{
        if(skipped_char != 0){
          output.push([skipped_char, rest_text.slice(0,start)]);
          skipped_char = "";
          rest_text = rest_text.slice(start);
          output.push([char, yomi]);
          rest_text = rest_text.slice(yomi.length);          
        }else{
          output[output.length-1][1]+= rest_text.slice(0, start);
          rest_text = rest_text.slice(start);
          output.push([char, yomi]);
          rest_text = rest_text.slice(yomi.length);                    
        }
      }
    }else{
      output.push([char, yomi]);
      rest_text = rest_text.slice(yomi.length);
    }
  }

  //ループで処理しきれなかった文字列の処理
  if(skipped_char != ""){
    if(rest_text != ""){
      console.log(skipped_char, rest_text);
      output.push([skipped_char, rest_text]);
    }else{
      if(output.length == 0){
        //たぶんほとんどないケース
        output.push([skipped_char, rest_text]);
      }else{
        output[output.length-1][0]+=skipped_char;        
      }
    }
  }else{
    if(rest_text != ""){
      if(output.length == 0){
        //この分岐はたぶんない
      }else{
        output[output.length-1][1] += rest_text;
      }
    }
  }
  output = output.map(function([surface, yomi]){
    return charAllocate(surface, yomi);
  });
  output = output.flat();
  return output;
}

function charAllocate (surface, pronunciation) {
  let id = {surface: "surface", pronunciation: "pronunciation"}
  let text = {surface: surface, pronunciation: pronunciation}
  let longer = id.surface;
  let shorter = id.pronunciation;
  if(surface.length <= pronunciation.length){
    longer = id.pronunciation;
    shorter = id.surface;
  }
  let plusone = text[longer].length % text[shorter].length;
  let contentlen = Math.floor(text[longer].length/text[shorter].length);

  let output = [];
  let longer_pos = 0;
  for(let i = 0; i<text[shorter].length; i++){

    let longer_content_len = contentlen;
    if(i<plusone) longer_content_len += 1;
    //pronunciationが長いときと短いときで処理を変える
    if(longer == id.pronunciation){//pronunciationが長いとき、pronunciation1文字ずつに重複する1文字のsurfaceを対応させ、in_order_posで区別する
      for(let j=0;j<longer_content_len; j++){
        let info = {}
        info[longer]=text[longer][longer_pos+j];
        info[shorter] = text[shorter][i];
        info["in_surface_pos"] = j;
        output.push(info);
      }
      longer_pos += longer_content_len;
    }else{//pronunciationが短いとき、pronunciation１文字にsurface複数文字を対応させる
      let info = {}
      info[longer] = text[longer].slice(longer_pos, longer_pos + longer_content_len);
      info[shorter] = text[shorter][i];
      info["in_surface_pos"] = 0;
      longer_pos += 1;
      console.log("info",info);
      output.push(info);
    }
  }
  return output;
}

function getCharCorrespondance(text, tokenizer, kanji_dict = {}){
  //形態素解析
  let tokens = tokenize(text, tokenizer);
  //カナ部分とカナ以外部分の対応を見つける
  let kana_correspondance = tokens.map(token=>{
    let surface = token["surface_form"]
    let pronunciation = token["pronunciation"]
    let pos = token["pos"]
    //surfaceを解析
    let separated = kanaTokenize(surface);
    //カナ、カナ以外の対応を見つける
    let correspondance = kanaAllocate(separated, pronunciation);
    //記号の場合はtypeに記号を設定する
    if(pos == "記号"){
      correspondance = correspondance.map(v=>{
        v["type"] = "sign";
        return v;
      });
    }
    return correspondance;
  });
  kana_correspondance = kana_correspondance.flat(); //1重のリストにする

  //１文字ずつの対応を見つける
  let char_correspondance = kana_correspondance.map(token => {
    let surface = token["surface"]
    let type = token["type"]
    let pronunciation = token["pronunciation"]
    let correspondance = null;
    if(type == "nonkana"){
      correspondance = kanjiAllocate(surface, pronunciation, kanji_dict);
    }else{
      correspondance = charAllocate(surface, pronunciation);
    }
    correspondance = correspondance.map(v => {
      v["type"] = type;
      return v;
    });
    return correspondance;
  });
  char_correspondance = char_correspondance.flat();

  return char_correspondance;
}