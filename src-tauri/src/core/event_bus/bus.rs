use super::event::BusTopic;
use std::any::{Any, TypeId};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tokio::sync::broadcast;

/// Event bus for publishing and subscribing to system events
///
/// Uses a HashMap to store broadcast channels keyed by TypeId.
/// This allows generic, type-safe event handling without unsafe code.
pub struct EventBus {
    senders: Arc<RwLock<HashMap<TypeId, Box<dyn Any + Send + Sync>>>>,
}

impl EventBus {
    /// Create a new event bus with default capacity (32)
    pub fn new() -> Self {
        Self::with_capacity(32)
    }

    /// Create a new event bus with specified channel capacity
    pub fn with_capacity(capacity: usize) -> Self {
        // We don't use capacity here since we create channels on-demand
        // But we keep the parameter for API compatibility
        let _ = capacity;
        Self {
            senders: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Publish a message to a topic
    ///
    /// Returns Err only if the internal lock is poisoned (critical failure).
    pub fn publish<T: BusTopic>(&self, msg: T::Message) -> anyhow::Result<()> {
        let senders = self
            .senders
            .read()
            .map_err(|_| anyhow::anyhow!("EventBus lock poisoned"))?;

        let _ = senders
            .get(&TypeId::of::<T>())
            .and_then(|sender_any| sender_any.downcast_ref::<broadcast::Sender<T::Message>>())
            .inspect(|tx| {
                let _ = tx.send(msg);
            });

        Ok(())
    }

    /// Subscribe to a topic
    pub fn subscribe<T: BusTopic>(&self) -> anyhow::Result<broadcast::Receiver<T::Message>> {
        let mut senders = self
            .senders
            .write()
            .map_err(|_| anyhow::anyhow!("EventBus lock poisoned"))?;

        let sender = senders.entry(TypeId::of::<T>()).or_insert_with(|| {
            let (tx, _) = broadcast::channel::<T::Message>(32);
            Box::new(tx)
        });

        sender
            .downcast_ref::<broadcast::Sender<T::Message>>()
            .ok_or_else(|| anyhow::anyhow!("Type mismatch in EventBus - impossible"))
            .map(|tx| tx.subscribe())
    }
}

impl Clone for EventBus {
    fn clone(&self) -> Self {
        Self {
            senders: self.senders.clone(),
        }
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::event_bus::event::{FundUpdated, PatientUpdated, ProcedureUpdated};

    #[tokio::test]
    async fn test_publish_subscribe_patients() {
        let bus = EventBus::new();
        let mut rx = bus.subscribe::<PatientUpdated>().unwrap();

        bus.publish::<PatientUpdated>(PatientUpdated).unwrap();

        let _received = rx.recv().await.unwrap();
        // Verify event was received
    }

    #[tokio::test]
    async fn test_publish_subscribe_funds() {
        let bus = EventBus::new();
        let mut rx = bus.subscribe::<FundUpdated>().unwrap();

        bus.publish::<FundUpdated>(FundUpdated).unwrap();

        let _received = rx.recv().await.unwrap();
        // Verify event was received
    }

    #[tokio::test]
    async fn test_publish_subscribe_procedures() {
        let bus = EventBus::new();
        let mut rx = bus.subscribe::<ProcedureUpdated>().unwrap();

        bus.publish::<ProcedureUpdated>(ProcedureUpdated).unwrap();

        let _received = rx.recv().await.unwrap();
        // Verify event was received
    }

    #[tokio::test]
    async fn test_multiple_subscribers() {
        let bus = EventBus::new();
        let mut rx1 = bus.subscribe::<PatientUpdated>().unwrap();
        let mut rx2 = bus.subscribe::<PatientUpdated>().unwrap();

        bus.publish::<PatientUpdated>(PatientUpdated).unwrap();

        let _received1 = rx1.recv().await.unwrap();
        let _received2 = rx2.recv().await.unwrap();
        // Verify both subscribers received the event
    }
}
