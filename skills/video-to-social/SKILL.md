---
name: video-to-social
description: Convert SRT transcripts or video transcriptions into publish-ready X/Twitter threads, LinkedIn posts, or newsletter drafts. Use whenever the user asks to turn a video or transcript into a social post, X thread, or LinkedIn article.
---

# Convert Video Transcript to Social Content

Turn raw video transcriptions from `@illyism/transcribe` into ready-to-post social media content.

## Platform Decision Procedure

Walk this flowchart to format content for the target platform:

```
Which platform is the content intended for?
├── X / Twitter Thread
│   ├── Tweet 1 (Hook): Standalone strong claim or counter-intuitive stat from the video. Max 280 chars. Must end with "🧵👇"
│   ├── Tweets 2-6 (Body): Single core idea per tweet. Max 280 chars each. Use bullet points and line breaks.
│   └── Final Tweet (Call to Action): Link to original video or invite discussion.
├── LinkedIn Post
│   ├── Line 1 (Hook): High-friction, single line that forces a "see more" click.
│   ├── Paragraphs 2-4: Short 1-2 sentence paragraphs with whitespace between them.
│   ├── Key Takeaways: 3-5 bullet points using "• " or emoji anchors.
│   └── Bottom: 3 relevant hashtags (#VideoMarketing #ContentCreation).
└── Newsletter / Article Draft
    ├── Title: Punchy, action-oriented headline.
    ├── Introduction: Context from video thesis.
    ├── Subheadings (H2): Structured by key topic timestamps.
    └── Conclusion: Final key takeaway + next steps.
```

## Content Rules

1. **Convert Speech to Written Style**: Spoken dialogue contains filler words ("like", "um", "you know"), repetition, and incomplete sentences. Remove all filler while preserving the original voice and argument.
2. **Hook Integrity**: Extract the most surprising or controversial insight from the first 30% of the video to form the opening hook.
3. **Strict Length Limits**:
   - X / Twitter: Every individual post MUST be strictly ≤ 280 characters.
   - LinkedIn: Keep total length under 3,000 characters; maximize readability with whitespace every 2 lines.

## Example Output (X / Twitter Thread)

```markdown
1/ Hooks don't matter as much as you think. 

Pull up your worst-performing video and look at the watch time graph. 

People STILL watch the first 3-4 seconds. 

Here are 3 things that ACTUALLY drive retention 🧵👇

2/ 1. The 5-second cliff

The real drop-off happens between seconds 5 and 15. 

If you don't deliver on the implicit promise by second 5, they swipe away.

3/ 2. Visual reset frequency

Change angles, text overlays, or graphics every 2.5 seconds. 

Audio keeps attention, but visual movement prevents scrolling.
```
