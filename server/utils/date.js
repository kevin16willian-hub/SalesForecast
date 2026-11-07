// Formata data para dd/mm/yyyy
function formatBR(dateValue) {
  if (!dateValue) return null;
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return null;
  const day   = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year  = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

// Retorna fechamento atual no formato YYYYMM usando horário de Brasília (America/Sao_Paulo)
function FechamentoNow() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'America/Sao_Paulo',
    year:  'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year  = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  return `${year}${month}`;
}

// Retorna data/hora UTC no formato AAAAMMDDHHmmss (ex: 20260430183819)
function getUpdateDateNow() {
  const now = new Date();
  return (
    `${now.getUTCFullYear()}` +
    `${String(now.getUTCMonth() + 1).padStart(2, '0')}` +
    `${String(now.getUTCDate()).padStart(2, '0')}` +
    `${String(now.getUTCHours()).padStart(2, '0')}` +
    `${String(now.getUTCMinutes()).padStart(2, '0')}` +
    `${String(now.getUTCSeconds()).padStart(2, '0')}`
  );
}

module.exports = { formatBR, FechamentoNow, getUpdateDateNow };
