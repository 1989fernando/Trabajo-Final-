import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';

let db = null;

// Obtener o abrir la conexión de base de datos de forma compatible
function getDB() {
  if (!db) {
    if (SQLite.openDatabaseSync) {
      db = SQLite.openDatabaseSync('app_local.db');
    } else if (SQLite.openDatabase) {
      db = SQLite.openDatabase('app_local.db');
    }
  }
  return db;
}

// Inicializar esquemas
export async function initDB() {
  const database = getDB();
  if (!database) return;

  try {
    if (database.execSync) {
      database.execSync(`
        CREATE TABLE IF NOT EXISTS productos (
          id TEXT PRIMARY KEY NOT NULL,
          nombre TEXT NOT NULL,
          precio REAL NOT NULL,
          sync_status TEXT NOT NULL,
          client_updated_at INTEGER NOT NULL,
          server_updated_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS sync_queue (
          id TEXT PRIMARY KEY NOT NULL,
          endpoint TEXT NOT NULL,
          method TEXT NOT NULL,
          payload TEXT NOT NULL,
          retries INTEGER DEFAULT 0
        );
      `);
    } else if (database.execAsync) {
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS productos (
          id TEXT PRIMARY KEY NOT NULL,
          nombre TEXT NOT NULL,
          precio REAL NOT NULL,
          sync_status TEXT NOT NULL,
          client_updated_at INTEGER NOT NULL,
          server_updated_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS sync_queue (
          id TEXT PRIMARY KEY NOT NULL,
          endpoint TEXT NOT NULL,
          method TEXT NOT NULL,
          payload TEXT NOT NULL,
          retries INTEGER DEFAULT 0
        );
      `);
    }
  } catch (e) {
    console.warn('Error inicializando tablas:', e);
  }
}

// Consultar todos los productos
export function getLocalProductos() {
  const database = getDB();
  if (!database || !database.getAllSync) return [];
  try {
    return database.getAllSync('SELECT * FROM productos ORDER BY client_updated_at DESC;') || [];
  } catch {
    return [];
  }
}


// Insertar producto
export function insertLocalProducto(producto) {
  const database = getDB();
  if (!database || !database.runSync) return;
  const updatedAt = producto.client_updated_at || new Date().toISOString();
 database.runSync(
    'INSERT OR REPLACE INTO productos (id, nombre, precio, sync_status, client_updated_at) VALUES (?, ?, ?, ?, ?);',
    [producto.id, producto.nombre, producto.precio, producto.sync_status || 'pending', updatedAt]
  );
}

// Encolar solicitud offline
export function enqueueRequest(endpoint, method, payload, id = null) {
  const database = getDB();
  if (!database || !database.runSync) return;
  const requestId = id || `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
  
  database.runSync(
    'INSERT INTO sync_queue (id, endpoint, method, payload) VALUES (?, ?, ?, ?);',
    [requestId, endpoint, method, payloadString]
  );
}

// Procesar cola
export function getPendingQueue() {
  const database = getDB();
  if (!database || !database.getAllSync) return [];
  try {
    return database.getAllSync('SELECT * FROM sync_queue WHERE retries < 3;') || [];
  } catch {
    return [];
  }
}

export function removeQueueItem(id) {
  const database = getDB();
  if (!database || !database.runSync) return;
  database.runSync('DELETE FROM sync_queue WHERE id = ?;', [id]);
  database.runSync('UPDATE productos SET sync_status = ?, server_updated_at = ? WHERE id = ?;', ['SYNCED', Date.now(), id]);
}

// Almacenamiento seguro
export async function saveAuthToken(token) {
  try {
    await SecureStore.setItemAsync('auth_token', token);
  } catch (e) {
    console.warn(e);
  }
}

export async function getAuthToken() {
  try {
    return await SecureStore.getItemAsync('auth_token');
  } catch {
    return null;
  }
}

// Cierre de sesión y purga completa
export async function clearAllLocalData() {
  try {
    await SecureStore.deleteItemAsync('auth_token');
  } catch {}
  const database = getDB();
  if (database && database.runSync) {
    database.runSync('DELETE FROM productos;');
    database.runSync('DELETE FROM sync_queue;');
  }
}




