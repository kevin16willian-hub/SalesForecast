const Database = require('better-sqlite3');
const path     = require('path');
const db       = new Database(path.join(__dirname, 'auth.db'));

const args = process.argv.slice(2);

async function main() {
	if (args[0] === 'delete' && args[1]) {
		const id = Number(args[1]);
		if (!Number.isFinite(id)) {
			console.error('ID inválido:', args[1]);
			process.exit(1);
		}
		const stmt = db.prepare('DELETE FROM users WHERE id = ?');
		const info = stmt.run(id);
		if (info.changes > 0) {
			console.log('Usuário deletado com id:', id);
		} else {
			console.log('Nenhum usuário encontrado com id:', id);
		}
		process.exit(0);
	}

	if (args[0] === 'view') {
		const users = db.prepare('SELECT * FROM users').all();
		console.log(users);
		process.exit(0);
	}

	if (args[0] === 'create' && args[1] && args[2]) {
		const email = String(args[1]).trim().toLowerCase();
		const role = String(args[2] || 'user').trim().toLowerCase();
		if (!['user', 'admin'].includes(role)) {
			console.error('Role inválida. Use "user" ou "admin".');
			process.exit(1);
		}
		try {
			const stmt = db.prepare('INSERT INTO users (email, role) VALUES (?, ?)');
			const info = stmt.run(email, role);
			console.log('Usuário criado com id:', info.lastInsertRowid);
		} catch (err) {
			if (err && err.message && err.message.includes('UNIQUE')) {
				console.log('Usuário já existe:', email);
			} else {
				console.error('Erro ao criar usuário:', err.message || err);
			}
		}
		process.exit(0);
	}
	if (args[0] === 'setrole' && args[1] && args[2]) {
		const email = String(args[1]).trim().toLowerCase();
		const newRole = String(args[2]).trim().toLowerCase();
		if (!['user', 'admin'].includes(newRole)) {
			console.error('Role inválida. Use "user" ou "admin".');
			process.exit(1);
		}
		const stmt = db.prepare('UPDATE users SET role = ? WHERE email = ?');
		const info = stmt.run(newRole, email);
		if (info.changes > 0) {
			console.log(`Role do usuário ${email} alterada para: ${newRole}`);
		} else {
			console.log('Usuário não encontrado:', email);
		}
		process.exit(0);
	}

	// Default: mostra instruções de uso
	console.log('Uso:');
	console.log('  node auth_view.js view');
	console.log('  node auth_view.js delete <id>');
	console.log('  node auth_view.js create <email> [role]');
	console.log('  node auth_view.js setrole <email> <role>');
	process.exit(0);
}

main();