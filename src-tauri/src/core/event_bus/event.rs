use serde::Serialize;

/// Trait that links a Topic to its Message type
pub trait BusTopic: 'static {
    type Message: Clone + Send + Sync + 'static + Serialize;
}

#[derive(Debug, Serialize, Clone)]
pub struct PatientUpdated;

impl BusTopic for PatientUpdated {
    type Message = Self;
}

#[derive(Debug, Serialize, Clone)]
pub struct FundUpdated;

impl BusTopic for FundUpdated {
    type Message = Self;
}

#[derive(Debug, Serialize, Clone)]
pub struct ProcedureUpdated;

impl BusTopic for ProcedureUpdated {
    type Message = Self;
}

#[derive(Debug, Serialize, Clone)]
pub struct ProcedureTypeUpdated;

impl BusTopic for ProcedureTypeUpdated {
    type Message = Self;
}

#[derive(Debug, Serialize, Clone)]
pub struct FundPaymentGroupUpdated;

impl BusTopic for FundPaymentGroupUpdated {
    type Message = Self;
}

#[derive(Debug, Serialize, Clone)]
pub struct BankTransferUpdated;

impl BusTopic for BankTransferUpdated {
    type Message = Self;
}

#[derive(Debug, Serialize, Clone)]
pub struct BankAccountUpdated;

impl BusTopic for BankAccountUpdated {
    type Message = Self;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_serializable() {
        let event = PatientUpdated;
        let json = serde_json::to_string(&event).expect("should serialize");
        assert!(!json.is_empty());
    }
}
