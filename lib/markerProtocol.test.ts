import {
  stripStepDoneMarker,
  stripOffTopicMarker,
  stripToolCallArtifacts,
} from './markerProtocol';

describe('stripStepDoneMarker', () => {
  it('matches exact bracketed marker', () => {
    expect(stripStepDoneMarker('Great job! [STEP_DONE]')).toEqual({
      matched: true,
      cleaned: 'Great job!',
    });
  });

  it('matches marker without brackets', () => {
    expect(stripStepDoneMarker('Great job! STEP_DONE')).toEqual({
      matched: true,
      cleaned: 'Great job!',
    });
  });

  it('matches marker regardless of case', () => {
    expect(stripStepDoneMarker('Nice! step done')).toEqual({
      matched: true,
      cleaned: 'Nice!',
    });
  });

  it('matches marker with space instead of underscore', () => {
    expect(stripStepDoneMarker('Nice! [STEP DONE]')).toEqual({
      matched: true,
      cleaned: 'Nice!',
    });
  });

  it('matches marker in the middle of the text (does not collapse inner whitespace)', () => {
    expect(stripStepDoneMarker('Before [STEP_DONE] after')).toEqual({
      matched: true,
      cleaned: 'Before  after',
    });
  });

  it('does not match when marker is absent', () => {
    expect(stripStepDoneMarker('Just a normal sentence.')).toEqual({
      matched: false,
      cleaned: 'Just a normal sentence.',
    });
  });

  it('does not falsely report matched due to trimming untrimmed input', () => {
    expect(stripStepDoneMarker('  no marker here  ')).toEqual({
      matched: false,
      cleaned: 'no marker here',
    });
  });

  it('handles empty string', () => {
    expect(stripStepDoneMarker('')).toEqual({ matched: false, cleaned: '' });
  });
});

describe('stripOffTopicMarker', () => {
  it('matches exact bracketed marker', () => {
    expect(stripOffTopicMarker('Let’s get back. [OFFTOPIC]')).toEqual({
      matched: true,
      cleaned: 'Let’s get back.',
    });
  });

  it('matches marker with underscore variant', () => {
    expect(stripOffTopicMarker('Hmm [OFF_TOPIC]')).toEqual({
      matched: true,
      cleaned: 'Hmm',
    });
  });

  it('matches marker without brackets, lowercase', () => {
    expect(stripOffTopicMarker('off topic')).toEqual({
      matched: true,
      cleaned: '',
    });
  });

  it('does not match when marker is absent', () => {
    expect(stripOffTopicMarker('Still on task.')).toEqual({
      matched: false,
      cleaned: 'Still on task.',
    });
  });

  it('does not match STEP_DONE text', () => {
    expect(stripOffTopicMarker('[STEP_DONE]')).toEqual({
      matched: false,
      cleaned: '[STEP_DONE]',
    });
  });
});

describe('stripToolCallArtifacts', () => {
  it('strips full tool call with parens', () => {
    expect(stripToolCallArtifacts('Okay! report_off_topic()')).toEqual({
      matched: true,
      cleaned: 'Okay!',
    });
  });

  it('strips truncated tool call "report_("', () => {
    expect(stripToolCallArtifacts('Hmm report_(')).toEqual({
      matched: true,
      cleaned: 'Hmm',
    });
  });

  it('strips mark_step_complete with arguments', () => {
    expect(stripToolCallArtifacts('Great job! mark_step_complete(step_order=1)')).toEqual({
      matched: true,
      cleaned: 'Great job!',
    });
  });

  it('strips bare tool name without parens', () => {
    expect(stripToolCallArtifacts('mark_step_complete now')).toEqual({
      matched: true,
      cleaned: 'now',
    });
  });

  it('collapses double spaces left behind mid-sentence', () => {
    expect(stripToolCallArtifacts('Before report_off_topic() after')).toEqual({
      matched: true,
      cleaned: 'Before after',
    });
  });

  it('does not touch normal speech', () => {
    expect(stripToolCallArtifacts('Can you say hello to the shopkeeper?')).toEqual({
      matched: false,
      cleaned: 'Can you say hello to the shopkeeper?',
    });
  });
});
