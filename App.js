import React, { useState, useEffect } from 'react';
import { View, Text, Button, Alert, Image, StyleSheet, Linking } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { initDB, insertInspection, getPendingInspections, markAsSynced } from './database';
import api from './api';

export default function App() {
  const [photo, setPhoto] = useState(null);
  const [location, setLocation] = useState(null);
  const [statusMsg, setStatusMsg] = useState("Esperando acción...");

  useEffect(() => {
    // Inicializamos la base de datos local al abrir la app
    initDB();
  }, []);

  // --- Capacidad 1: CÁMARA (Gestión de los 4 estados) ---
  const handleCamera = async () => {
    const { status, canAskAgain } = await ImagePicker.getCameraPermissionsAsync();

    if (status === 'granted') {
      launchCamera();
    } else if (canAskAgain) {
      // Estado: Denegado/Primera vez -> Explicación previa
      Alert.alert(
        "Permiso Requerido",
        "Necesitamos acceso a la cámara para capturar la evidencia visual de la inspección.",
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Permitir",
            onPress: async () => {
              const { status: newStatus } = await ImagePicker.requestCameraPermissionsAsync();
              if (newStatus === 'granted') launchCamera();
              else setStatusMsg("Funcionalidad de cámara denegada (Degradación).");
            }
          }
        ]
      );
    } else {
      // Estado: Denegación Permanente -> Acceso a ajustes del sistema
      Alert.alert(
        "Permiso Bloqueado",
        "Has denegado la cámara permanentemente. Habilítala en los ajustes del sistema.",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Abrir Ajustes", onPress: () => Linking.openSettings() }
        ]
      );
    }
  };

  const launchCamera = async () => {
    let result = await ImagePicker.launchCameraAsync({ quality: 0.5 });
    if (!result.canceled) {
      setPhoto(result.assets[0].uri);
      setStatusMsg("Foto capturada exitosamente.");
    }
  };

  // --- Capacidad 2: UBICACIÓN (GPS) ---
  const handleLocation = async () => {
    // Estado: Servicio de hardware apagado
    const serviceEnabled = await Location.hasServicesEnabledAsync();
    if (!serviceEnabled) {
      setStatusMsg("Por favor, enciende el GPS de tu dispositivo.");
      return;
    }

    const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();

    if (status === 'granted') {
      getCurrentLocation();
    } else if (canAskAgain) {
      Alert.alert(
        "Permiso Requerido",
        "Requerimos tu ubicación para auditar el área exacta de limpieza.",
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Permitir",
            onPress: async () => {
              const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
              if (newStatus === 'granted') getCurrentLocation();
              else setStatusMsg("Registro de ubicación omitido (Degradación).");
            }
          }
        ]
      );
    } else {
      Alert.alert(
        "Permiso Bloqueado",
        "El GPS está bloqueado permanentemente. Ve a los ajustes para habilitarlo.",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Abrir Ajustes", onPress: () => Linking.openSettings() }
        ]
      );
    }
  };

  const getCurrentLocation = async () => {
    setStatusMsg("Obteniendo ubicación...");
    let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setLocation(loc.coords);
    setStatusMsg(`Ubicación: ${loc.coords.latitude.toFixed(4)}, ${loc.coords.longitude.toFixed(4)}`);
  };

  // --- INTEGRACIÓN: Persistencia Local + Backend ---
  const saveAndSync = async () => {
    if (!location) {
      Alert.alert("Atención", "Captura la ubicación antes de guardar.");
      return;
    }

    const timestamp = new Date().toISOString();
    
    try {
      // 1. Guardar en SQLite
      await insertInspection(location.latitude, location.longitude, timestamp);
      setStatusMsg("Guardado en caché local (SQLite). Sincronizando...");

      // 2. Intentar enviar al backend Flask
      const pending = await getPendingInspections();
      
      for (let record of pending) {
        try {
          await api.post('/inspecciones', {
            latitude: record.latitude,
            longitude: record.longitude,
            timestamp: record.timestamp
          });
          
          await markAsSynced(record.id);
          setStatusMsg(`Sincronizado con el backend exitosamente.`);
        } catch (apiError) {
          setStatusMsg("Sin conexión al servidor. Datos guardados localmente.");
        }
      }
    } catch (error) {
       setStatusMsg("Error al guardar en la base de datos local.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Inspección de Bioseguridad</Text>
      
      <View style={styles.statusBox}>
        <Text style={styles.statusText}>{statusMsg}</Text>
      </View>

      {photo ? (
        <Image source={{ uri: photo }} style={styles.image} />
      ) : (
        <View style={styles.placeholder}>
          <Text style={{color: '#666'}}>Sin evidencia fotográfica</Text>
        </View>
      )}

      <Button title="1. Capturar Evidencia (Cámara)" onPress={handleCamera} />
      <View style={styles.space} />
      
      <Button title="2. Registrar Ubicación (GPS)" onPress={handleLocation} />
      <View style={styles.space} />
      
      <Button title="3. Guardar y Sincronizar" onPress={saveAndSync} color="green" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: '#f5f5f5' },
  title: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  statusBox: { padding: 15, backgroundColor: '#e0e0e0', borderRadius: 8, marginBottom: 20 },
  statusText: { textAlign: 'center', fontWeight: 'bold', color: '#333' },
  image: { width: '100%', height: 250, borderRadius: 10, marginBottom: 20, resizeMode: 'cover' },
  placeholder: { width: '100%', height: 250, backgroundColor: '#ddd', borderRadius: 10, marginBottom: 20, justifyContent: 'center', alignItems: 'center' },
  space: { height: 15 }
});