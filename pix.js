// Gera o "Pix copia e cola" (BR Code estático) conforme o padrão do Banco Central.

function tlv(id, valor) {
  return id + String(valor.length).padStart(2, "0") + valor;
}

function crc16(texto) {
  let crc = 0xFFFF;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// Remove acentos e símbolos, deixa em maiúsculas e corta no tamanho máximo
function limpar(txt, max) {
  return String(txt)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .toUpperCase().trim().slice(0, max).trim();
}

function gerarPixCopiaECola({ chave, valor, nome, cidade, txid }) {
  const conta = tlv("00", "br.gov.bcb.pix") + tlv("01", chave);

  let payload =
    tlv("00", "01") +
    tlv("01", "11") +
    tlv("26", conta) +
    tlv("52", "0000") +
    tlv("53", "986");

  if (valor > 0) payload += tlv("54", Number(valor).toFixed(2));

  const id = txid ? String(txid).replace(/[^A-Za-z0-9]/g, "").slice(0, 25) : "";

  payload +=
    tlv("58", "BR") +
    tlv("59", limpar(nome, 25)) +
    tlv("60", limpar(cidade, 15)) +
    tlv("62", tlv("05", id || "***"));

  payload += "6304";
  return payload + crc16(payload);
}

module.exports = { gerarPixCopiaECola };

