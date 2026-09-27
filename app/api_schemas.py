from typing import Literal, Optional

from pydantic import BaseModel, Field

AgeGroup = Literal["under_18", "18-24", "25-34", "35-44", "45+"]
PreferenceType = Literal["set_forget", "daily_control", "non_hormonal", "unsure"]
AccessType = Literal["clinic", "pharmacy", "chw"]
HormonalSensitivity = Literal["none", "mild", "high"]
PregnancyGoal = Literal["avoid_long", "spacing_1_3", "spacing_3_plus", "unsure"]


class TriageAnswers(BaseModel):
    """Detailed answers from the web chat triage. See engine.models.UserProfile for the codes."""

    age: int = Field(ge=10, le=55)
    gender: Literal["female", "male"] = "female"
    pregnancy_status: Optional[Literal["not_pregnant", "unsure", "pregnant"]] = None
    unprotected_sex_5d: bool = False
    postpartum: Optional[Literal["none", "lt48h", "2d_3w", "3_4w", "4_6w", "6w_6m"]] = None
    breastfeeding_mode: Optional[Literal["exclusive", "partial", "none"]] = None
    periods_returned: Optional[bool] = None
    blood_pressure: Optional[Literal["normal", "controlled", "140_159", "160_plus", "unknown"]] = None
    smoking: Optional[Literal["no", "under_15", "15_plus"]] = None
    conditions: list[str] = Field(default_factory=list)
    medications: list[str] = Field(default_factory=list)
    fertility_intent: Optional[Literal["within_2y", "over_2y", "no_more", "unsure"]] = None
    comfortable_with: list[str] = Field(default_factory=list)
    bleeding_changes_ok: Optional[bool] = None
    needs_privacy: bool = False
    sti_protection: bool = False
    clinic_visits: Optional[Literal["easy", "sometimes", "hard"]] = None


class WebRecommendRequest(BaseModel):
    age_group: AgeGroup = "25-34"
    triage: Optional[TriageAnswers] = None
    breastfeeding: bool = False
    health_flags: list[str] = Field(default_factory=list)
    preference: PreferenceType = "unsure"
    access: AccessType = "clinic"
    hormonal_sensitivity: HormonalSensitivity = "none"
    pregnancy_goal: PregnancyGoal = "unsure"
    parity: bool = False
    language: str = "english"
    district: Optional[str] = None


class SideEffectItem(BaseModel):
    name: str
    severity: str
    quadrant: str
    timeline: str


class MethodRecommendation(BaseModel):
    method: str
    name: str
    description: str
    mec_category: int
    effectiveness_typical: float
    effectiveness_perfect: float
    duration: str
    reversibility: str
    cost_band: str
    access_required: str
    hormonal_type: str
    breastfeeding_ok: bool
    side_effects: list[SideEffectItem]
    chw_script: Optional[str] = None
    # Set when the method is MEC 2 (usable, with care).
    caution: Optional[str] = None
    caution_code: Optional[str] = None


class SafetyElimination(BaseModel):
    method: str
    reason: str
    reason_code: Optional[str] = None
    mec_category: int = 3


class WebRecommendResponse(BaseModel):
    recommendations: list[MethodRecommendation]
    safety_eliminations: list[SafetyElimination]
    recommendation_text: str
    alerts: list[str] = Field(default_factory=list)


class WebChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    language: str = "english"
    context: Optional[dict] = None


class WebChatResponse(BaseModel):
    reply: str
    quick_replies: list[str] = Field(default_factory=list)
    state: Optional[str] = None
    session_id: Optional[str] = None
