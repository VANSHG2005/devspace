/**
 * DevSpace Database Seed
 * Creates demo users and workspaces for development
 * Run: node database/seed.js
 */

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { db, connectDB } from '../src/config/database.js';
import { v4 as uuidv4 } from 'uuid';

const seed = async () => {
  await connectDB();
  console.log('🌱 Seeding database...');

  // Create demo users
  const password = await bcrypt.hash('password123', 12);
  
  const users = [
    { id: uuidv4(), name: 'Alex Chen', email: 'alex@devspace.io', color: '#7c6af7' },
    { id: uuidv4(), name: 'Maria Silva', email: 'maria@devspace.io', color: '#3dffa0' },
    { id: uuidv4(), name: 'Jordan Kim', email: 'jordan@devspace.io', color: '#ff5370' },
  ];

  for (const user of users) {
    await db.query(
      `INSERT INTO users (id, name, email, password, color) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO NOTHING`,
      [user.id, user.name, user.email, password, user.color]
    );
    console.log(`✅ Created user: ${user.email}`);
  }

  // Create demo workspace
  const wsId = 'demo123abc';
  await db.query(
    `INSERT INTO workspaces (id, name, description, owner_id, language) 
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
    [wsId, 'Demo Workspace', 'A sample workspace to get started', users[0].id, 'javascript']
  );

  for (const user of users) {
    await db.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [wsId, user.id, user.id === users[0].id ? 'owner' : 'editor']
    );
  }

  await db.query(
    `INSERT INTO files (id, workspace_id, name, content, language, created_by) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT DO NOTHING`,
    [uuidv4(), wsId, 'index.js', `// Welcome to DevSpace!\n// Start collaborating here...\n\nconsole.log('Hello, World!');\n`, 'javascript', users[0].id]
  );

  console.log(`\n🎉 Seed complete!`);
  console.log(`\nDemo credentials:`);
  users.forEach(u => console.log(`  ${u.email} / password123`));
  console.log(`\nDemo workspace: /workspace/${wsId}`);
  process.exit(0);
};

seed().catch(err => { console.error('Seed failed:', err); process.exit(1); });
