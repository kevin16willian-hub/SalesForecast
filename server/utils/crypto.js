// Gera um código numérico de 6 dígitos para verificação de registro
function generate6DigitCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

module.exports = { generate6DigitCode };
