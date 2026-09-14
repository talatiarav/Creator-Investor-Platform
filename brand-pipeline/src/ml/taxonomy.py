# taxonomy.py
# Single source of truth for all classification dimensions.
# Imported by every script in the pipeline — changing a label here
# propagates everywhere automatically.
#
# These must exactly match the labels Claude returns in 1_generate_labels.py
# and the labels the TF model is trained on in 3_train_model.py.

CATEGORIES = [
    "Fashion & Style",
    "Beauty & Skincare",
    "Health & Fitness",
    "Food & Cooking",
    "Travel & Adventure",
    "Home & Interior Design",
    "Technology & Gaming",
    "Parenting & Family",
    "Finance & Business",
    "Art & Creativity",
    "Sustainability & Eco",
    "Entertainment & Pop Culture",
    "Sports & Outdoors",
    "Pets & Animals",
    "Education & Self-Development",
]

AESTHETICS = [
    "Minimalist & Clean",
    "Vibrant & Colourful",
    "Dark & Moody",
    "Natural & Earthy",
    "Luxury & High-End",
    "Casual & Authentic",
    "Professional & Corporate",
    "Artistic & Creative",
    "Playful & Fun",
    "Vintage & Retro",
]

AUDIENCES = [
    "Gen Z (18-24)",
    "Millennials (25-34)",
    "Parents (30-45)",
    "Professionals (25-45)",
    "Seniors (50+)",
    "Broad / Mixed",
]

TONES = [
    "Inspirational",
    "Educational",
    "Humorous",
    "Aspirational",
    "Authentic & Raw",
    "Promotional",
    "Community-Focused",
]

# Maps each dimension name to its label list and integer index lookup
DIMENSIONS = {
    "category":  CATEGORIES,
    "aesthetic": AESTHETICS,
    "audience":  AUDIENCES,
    "tone":      TONES,
}

# Integer → label lookup (used during inference to decode model output)
IDX_TO_LABEL = {
    dim: {i: label for i, label in enumerate(labels)}
    for dim, labels in DIMENSIONS.items()
}

# Label → integer lookup (used during training to encode Claude's output)
LABEL_TO_IDX = {
    dim: {label: i for i, label in enumerate(labels)}
    for dim, labels in DIMENSIONS.items()
}

# Image input shape for MobileNetV3 backbone
IMAGE_SIZE = (224, 224)
IMAGE_CHANNELS = 3
