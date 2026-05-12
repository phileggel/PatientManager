use super::event::BusTopic;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync;

/// Observer that listens to events and emits them to the Tauri frontend
///
/// Each observer is dedicated to a single event type and emits to the frontend.
/// This spawns a dedicated tokio::task that listens for messages in the background.
pub struct EventObserver<R: Runtime, T: BusTopic> {
    app: AppHandle<R>,
    rx: sync::broadcast::Receiver<T::Message>,
}

impl<R: Runtime + 'static, T: BusTopic + 'static> EventObserver<R, T>
where
    T::Message: serde::Serialize + Send + Sync,
{
    /// Create a new event observer for a specific event type
    pub fn new(app: AppHandle<R>, rx: sync::broadcast::Receiver<T::Message>) -> Self {
        Self { app, rx }
    }

    /// Spawn the observer as a background tokio::task
    pub fn spawn(mut self, event_name: &'static str) {
        tokio::spawn(async move {
            while let Ok(message) = self.rx.recv().await {
                let _ = self.app.emit(event_name, &message);
            }
        });
    }
}
