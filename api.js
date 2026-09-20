import axios from 'axios';

// Configura la URL base de tu API en Flask
const api = axios.create({
  // Si pruebas en un dispositivo físico local, usa la IP de tu computadora (ej. 192.168.1.X) en lugar de localhost
  baseURL: 'http://TU_IP_LOCAL:5000/api', 
  timeout: 5000,
});

// Interceptor para inyectar el token JWT en cada petición
api.interceptors.request.use(
  async (config) => {
    // En un proyecto completo, aquí recuperarías el token guardado en SecureStore
    // const token = await SecureStore.getItemAsync('jwt_token');
    const token = "TU_TOKEN_JWT_AQUI"; 
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para manejar errores (ej. token expirado)
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    if (error.response && error.response.status === 401) {
      console.log("Token expirado o no autorizado. Aquí iría la lógica de refresh token.");
    }
    return Promise.reject(error);
  }
);

export default api;