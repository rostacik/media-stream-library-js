// Elements: parts of a box that hold values.
// They should have a:
// - byteLength
// - value (can be accessed from outside to set/retrieve)
// - store(buffer, offset) -> write the value to a buffer
// - load(buffer, offset) -> read data and store in value

import { MediaTrack } from '../types/isom'
import {
  decode,
  readUInt8,
  readUInt16BE,
  readUInt24BE,
  readUInt32BE,
  writeUInt8,
  writeUInt16BE,
  writeUInt24BE,
  writeUInt32BE,
} from '../utils/bytes'

type BufferMutation = (buffer: Uint8Array, offset: number) => void

// Constants
const UINT32_RANGE = Math.pow(2, 32)

abstract class BoxElement {
  public byteLength: number
  public value: any
  abstract copy(buffer: Uint8Array, offset: number): void
  abstract load(buffer: Uint8Array, offset: number): void

  constructor(size: number) {
    this.byteLength = size
  }
}

class Empty extends BoxElement {
  constructor(size = 0) {
    super(size)
  }

  copy: BufferMutation = (buffer, offset) => {
    buffer.fill(0, offset, offset + this.byteLength)
  }

  load() {
    /** noop */
  }
}

class CharArray extends BoxElement {
  public value: string

  constructor(s: string) {
    super(s.length)
    this.value = s
  }

  copy: BufferMutation = (buffer, offset) => {
    for (let i = 0; i < this.byteLength; i += 1) {
      buffer[offset + i] = this.value.charCodeAt(i)
    }
  }

  load: BufferMutation = (buffer, offset) => {
    this.value = decode(buffer.subarray(offset, offset + this.byteLength))
  }
}

class UInt8 extends BoxElement {
  public value: number

  constructor(scalar = 0) {
    super(1)
    this.value = scalar
  }

  copy: BufferMutation = (buffer, offset) => {
    writeUInt8(buffer, offset, this.value)
  }

  load: BufferMutation = (buffer, offset) => {
    this.value = readUInt8(buffer, offset)
  }
}

class UInt8Array extends BoxElement {
  public value: number[]

  constructor(array: number[]) {
    super(array.length)
    this.value = array
  }

  copy: BufferMutation = (buffer, offset) => {
    for (let i = 0; i < this.value.length; ++i) {
      writeUInt8(buffer, offset + i, this.value[i])
    }
  }

  load: BufferMutation = (buffer, offset) => {
    for (let i = 0; i < this.value.length; ++i) {
      this.value[i] = readUInt8(buffer, offset + i)
    }
  }
}

class UInt16BE extends BoxElement {
  public value: number

  constructor(scalar = 0) {
    super(2)
    this.value = scalar
  }

  copy: BufferMutation = (buffer, offset) => {
    writeUInt16BE(buffer, offset, this.value)
  }

  load: BufferMutation = (buffer, offset) => {
    this.value = readUInt16BE(buffer, offset)
  }
}

class UInt24BE extends BoxElement {
  public value: number

  constructor(scalar = 0) {
    super(3)
    this.value = scalar
  }

  copy: BufferMutation = (buffer, offset) => {
    writeUInt24BE(buffer, offset, this.value)
  }

  load: BufferMutation = (buffer, offset) => {
    this.value = readUInt24BE(buffer, offset)
  }
}

class UInt16BEArray extends BoxElement {
  public value: number[]

  constructor(array: number[]) {
    super(array.length * 2)
    this.value = array
  }

  copy: BufferMutation = (buffer, offset) => {
    for (let i = 0; i < this.value.length; ++i) {
      writeUInt16BE(buffer, offset + 2 * i, this.value[i])
    }
  }

  load: BufferMutation = (buffer, offset) => {
    for (let i = 0; i < this.value.length; ++i) {
      this.value[i] = readUInt16BE(buffer, offset + 2 * i)
    }
  }
}

class UInt32BE extends BoxElement {
  public value: number

  constructor(scalar = 0) {
    super(4)
    this.value = scalar
  }

  copy: BufferMutation = (buffer, offset) => {
    writeUInt32BE(buffer, offset, this.value)
  }

  load: BufferMutation = (buffer, offset) => {
    this.value = readUInt32BE(buffer, offset)
  }
}

class UInt32BEArray extends BoxElement {
  public value: number[]

  constructor(array: number[]) {
    super(array.length * 4)
    this.value = array
  }

  copy: BufferMutation = (buffer, offset) => {
    for (let i = 0; i < this.value.length; ++i) {
      writeUInt32BE(buffer, offset + 4 * i, this.value[i])
    }
  }

  load: BufferMutation = (buffer, offset) => {
    for (let i = 0; i < this.value.length; ++i) {
      this.value[i] = readUInt32BE(buffer, offset + 4 * i)
    }
  }
}

class UInt64BE extends BoxElement {
  public value: number

  constructor(scalar = 0) {
    super(8)
    this.value = scalar
  }

  copy: BufferMutation = (buffer, offset) => {
    const high = (this.value / UINT32_RANGE) | 0
    const low = this.value - high * UINT32_RANGE
    writeUInt32BE(buffer, offset, high)
    writeUInt32BE(buffer, offset + 4, low)
  }

  load: BufferMutation = (buffer, offset) => {
    const high = readUInt32BE(buffer, offset)
    const low = readUInt32BE(buffer, offset + 4)
    this.value = high * UINT32_RANGE + low
  }
}

export class ByteArray extends BoxElement {
  public value: Uint8Array

  constructor(array: Uint8Array) {
    super(array.length)
    this.value = array
  }

  copy: BufferMutation = (buffer, offset) => {
    buffer.set(this.value, offset)
  }

  load: BufferMutation = (_buffer, _offset) => {
    throw new Error('not implemented')
  }
}

/**
 * Class factory for a parameter set element. A parameter set groups a size,
 * and an array of parameter sets consisting each of a size and a byte array.
 * These elements are used by the avcC box.
 * @param  [sizeMask=0x00]  A bit mask to use for the size.
 * @return An element type that groups parameter sets.
 */
const createParameterSetArrayClass = function (sizeMask = 0x00) {
  return class ParameterSetArray extends BoxElement {
    public value: any[]
    /**
     * Takes an array of byte-arrays
     * @param  array The array of byte arrays
     */
    constructor(array: number[][]) {
      super(0)
      // this.setLengths = array.map((byteArray) => byteArray.length);
      this.value = array.reduce(
        (flatArray: any, byteArray) => {
          return flatArray.concat(
            new UInt16BE(byteArray.length),
            new UInt8Array(byteArray)
          )
        },
        [new UInt8(sizeMask | array.length)]
      )
      this.byteLength = this.value.reduce(
        (total, element) => total + element.byteLength,
        0
      )
    }

    copy: BufferMutation = (buffer, offset) => {
      let i = 0
      for (const element of this.value) {
        element.copy(buffer, offset + i)
        i += element.byteLength
      }
    }

    load: BufferMutation = () => {
      /** noop */
    }
  }
}

interface BoxSpec {
  container?: string
  mandatory?: boolean
  quantity?: string
  box: 'Box' | 'FullBox' | 'None'
  is_container: boolean
  body?: Array<[string, any, any?]>
  config?: any
}

/**
 * Specifications for a selection of ISO BMFF box types.
 *
 * Most of these are defined in ISO/IEC 14496-12,
 * For specific boxes like avc1/avcC/mp4a/esds the exact document is specified
 * with the appropriate box/descriptor.
 *
 * To add a new box, follow the same pattern: you need an object with at least
 * the property 'box' (which is 'Box' or 'FullBox') and for non-container boxes
 * you need also a 'body' property specifying the elements that the box contains.
 * The values assigned to each element in the spec are used as default.
 */

const BOXSPEC: { [key: string]: BoxSpec } = {
  // File Type Box
  ftyp: {
    container: 'file',
    mandatory: true,
    quantity: 'one',
    box: 'Box',
    is_container: true,
    body: [
      ['major_brand', CharArray, 'isom'],
      ['minor_version', UInt32BE, 0],
      ['compatible_brands', CharArray, 'mp41'],
      // ['compatible_brands1', CharArray, 'iso2'],
      // ['compatible_brands2', CharArray, 'dash'],
    ],
  },
  // Movie Container
  moov: {
    container: 'file',
    mandatory: true,
    quantity: 'one',
    box: 'Box',
    is_container: true,
  },
  // Movie Data Box
  mdat: {
    container: 'file',
    mandatory: false,
    quantity: 'any',
    box: 'Box',
    is_container: false,
    body: [],
  },
  // Movie Header Box
  mvhd: {
    container: 'moov',
    mandatory: true,
    quantity: 'one',
    box: 'FullBox',
    is_container: false,
    body: [
      ['creation_time', UInt32BE, 0],
      ['modification_time', UInt32BE, 0],
      ['timescale', UInt32BE, 1000], // time-scale for entire presentation, default = milliseconds
      ['duration', UInt32BE, 0xffffffff], // length of entire presentation, default = undetermined
      ['rate', UInt32BE, 0x00010000], // fixed point 16.16, preferred playback rate, default = 1.0
      ['volume', UInt16BE, 0x0100], // fixed point 8.8, preferred playback volume, default = 1.0
      ['reserved', Empty, 10],
      // transformation matrix, default = unity
      [
        'matrix',
        UInt32BEArray,
        [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000],
      ],
      ['pre_defined', Empty, 24],
      ['next_track_ID', UInt32BE, 0xffffffff], // next unused track ID, default = unknown
    ],
  },
  // Track Container
  trak: {
    container: 'moov',
    mandatory: true,
    quantity: 'one+',
    box: 'Box',
    is_container: true,
  },
  // Track Header Box
  tkhd: {
    container: 'trak',
    mandatory: true,
    quantity: 'one',
    box: 'FullBox',
    is_container: false,
    // Flag values for the track header:
    // 0x000001 Track_enabled: track enabled (otherwise ignored)
    // 0x000002 Track_in_movie: track used in presentation
    // 0x000004 Track_in_preview: used when previewing presentation
    config: {
      flags: 0x000003, // track enabled and used in presentation
    },
    body: [
      ['creation_time', UInt32BE, 0],
      ['modification_time', UInt32BE, 0],
      ['track_ID', UInt32BE, 1], // Track identifier, cannot be 0
      ['reserved', Empty, 4],
      ['duration', UInt32BE, 0], // Duration of track using timescale of mvhd box
      ['reserved2', Empty, 8],
      ['layer', UInt16BE, 0], // Front-to-back ordering, lower is closer to viewer
      ['alternate_group', UInt16BE, 0], // Possible grouping of tracks
      ['volume', UInt16BE, 0x0100], // Track's relative audio volume 8.8 fixed point
      ['reserved3', Empty, 2],
      [
        'matrix',
        UInt32BEArray,
        [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000],
      ],
      ['width', UInt32BE, 0], // Visual presentation width, 16.16 fixed point
      ['height', UInt32BE, 0], // Visual presentation height, 16.16 fixed point
    ],
  },
  // Track Reference Box
  tref: {
    container: 'trak',
    mandatory: false,
    quantity: 'one-',
    box: 'Box',
    is_container: false,
  },
  // Media Container
  mdia: {
    container: 'trak',
    mandatory: false,
    quantity: 'one',
    box: 'Box',
    is_container: true,
  },
  // Media Header Box
  mdhd: {
    container: 'mdia',
    mandatory: false,
    quantity: 'one',
    box: 'FullBox',
    is_container: false,
    body: [
      ['creation_time', UInt32BE, 0],
      ['modification_time', UInt32BE, 0],
      ['timescale', UInt32BE, 1000], // time-scale for entire presentation, default = milliseconds
      ['duration', UInt32BE, 0xffffffff], // length of entire presentation, default = undetermined
      ['language', UInt16BE, 0], // ISO 639-2 lanugage code, three lower-case letters, stored as
      ['pre_defined', UInt16BE, 0],
    ],
  },
  // Handler Reference Box
  hdlr: {
    container: 'mdia',
    mandatory: true,
    quantity: 'one',
    box: 'FullBox',
    is_container: false,
    body: [
      ['predefined', UInt32BE, 0],
      ['handler_type', CharArray, 'vide'], // 'vide', 'soun', or 'hint'
      ['reserved', Empty, 12],
      ['name', CharArray, 'VideoHandler\0'],
    ],
  },
  // Media Information Container
  minf: {
    container: 'mdia',
    mandatory: true,
    quantity: 'one',
    box: 'Box',
    is_container: true,
  },
  // Video Media Header Box
  vmhd: {
    container: 'minf',
    mandatory: true,
    quantity: 'one',
    box: 'FullBox',
    is_container: false,
    config: {
      flags: 0x000001,
    },
    body: [
      ['graphicsmode', UInt16BE, 0], // Composition mode of the video track, 0 = overwrite
      ['opcolor', UInt16BEArray, [0, 0, 0]], // Red green blue, for use by graphics modes
    ],
  },
  // Sound Media Header Box
  smhd: {
    container: 'minf',
    mandatory: true,
    quantity: 'one',
    box: 'FullBox',
    is_container: false,
    body: [
      // Place mono track in stereo space:
      //  8.8 fixed point, 0 = center, -1.0 = left, 1.0 = right
      ['balance', UInt16BE, 0x0000],
      ['reserved', UInt16BE],
    ],
  },
  // Data Information Container
  dinf: {
    container: 'minf',
    mandatory: true,
    quantity: 'one',
    box: 'Box',
    is_container: true,
  },
  // Data Reference Box
  dref: {
    // When adding elements to this box, update the entry_count value!
    container: 'dinf',
    mandatory: true,
    quantity: 'one',
    box: 'FullBox',
    is_container: true,
    body: [
      ['entry_count', UInt32BE, 0], // Number of entries.
    ],
  },
  'url ': {
    container: 'dref',
    mandatory: true,
    quantity: 'one+',
    box: 'FullBox',
    is_container: false,
    // Flag values:
    // 0x000001 Local reference, which means empty URL
    config: {
      flags: 0x000001,
    },
    body: [
      // ['location', CharArray, ''],
    ],
  },
  // Sample Table Container
  stbl: {
    container: 'minf',
    mandatory: true,
    quantity: 'one',
    box: 'Box',
    is_container: true,
  },
  // Decoding Time to Sample Box
  stts: {
    container: 'stbl',
    mandatory: true,
    quantity: 'one',
    box: 'FullBox',
    is_container: false,
    body: [
      ['entry_count', UInt32BE, 0],
      // For each entry these two elements:
      // ['sample_count', UInt32BE, 0], // Number of consecutive samples with same delta
      // ['sample_delta', UInt32BE, 0], // Delta of each sample
    ],
  },
  stsd: {
    container: 'stbl',
    mandatory: true,
    quantity: 'one',
    box: 'FullBox',
    is_container: true,
    body: [
      ['entry_count', UInt32BE, 1],
      // For each entry, one of these three boxes depending on the handler:
      // VisualSampleEntry, AudioSampleEntry, HintSampleEntry
    ],
  },
  /*
  ISO/IEC 14496-12:2005(E) 8.16.2 (pp. 28)
  aligned(8) abstract class SampleEntry (unsigned int(32) format)
    extends Box(format){
    const unsigned int(8)[6] reserved = 0;
    unsigned int(16) data_reference_index;
  }
  class VisualSampleEntry(codingname) extends SampleEntry (codingname){
    unsigned int(16) pre_defined = 0;
    const unsigned int(16) reserved = 0;
    unsigned int(32)[3] pre_defined = 0;
    unsigned int(16) width;
    unsigned int(16) height;
    template unsigned int(32) horizresolution = 0x00480000; // 72 dpi
    template unsigned int(32) vertresolution = 0x00480000; // 72 dpi
    const unsigned int(32) reserved = 0;
    template unsigned int(16) frame_count = 1;
    string[32] compressorname;
    template unsigned int(16) depth = 0x0018;
    int(16) pre_defined = -1;
  }
  ISO/IEC 14496-15:2004(E) 5.3.4.1 (pp. 14)
  class AVCSampleEntry() extends VisualSampleEntry (‘avc1’){
    AVCConfigurationBox config;
    MPEG4BitRateBox (); // optional
    MPEG4ExtensionDescriptorsBox (); // optional
  }
  */
  avc1: {
    container: 'stsd',
    mandatory: false,
    quantity: 'one',
    box: 'Box',
    is_container: true,
    body: [
      ['reserved', Empty, 6],
      ['data_reference_index', UInt16BE, 1],
      ['pre_defined', UInt16BE, 0],
      ['reserved2', Empty, 2],
      ['pre_defined2', UInt32BEArray, [0, 0, 0]],
      ['width', UInt16BE, 1920],
      ['height', UInt16BE, 1080],
      ['horizresolution', UInt32BE, 0x00480000],
      ['vertresolution', UInt32BE, 0x00480000],
      ['reserved3', UInt32BE, 0],
      ['frame_count', UInt16BE, 1],
      ['compressorname', UInt8Array, new Uint8Array(32)],
      ['depth', UInt16BE, 0x0018],
      ['pre_defined3', UInt16BE, 0xffff],
    ],
  },
  /*
  class AVCConfigurationBox extends Box(‘avcC’) {
    AVCDecoderConfigurationRecord() AVCConfig;
  }
  ISO/IEC 14496-15:2004(E) 5.2.4.1.1 (pp. 12)
  aligned(8) class AVCDecoderConfigurationRecord {
    unsigned int(8) configurationVersion = 1;
    unsigned int(8) AVCProfileIndication;
    unsigned int(8) profile_compatibility;
    unsigned int(8) AVCLevelIndication;
    bit(6) reserved = ‘111111’b;
    unsigned int(2) lengthSizeMinusOne;
    bit(3) reserved = ‘111’b;
    unsigned int(5) numOfSequenceParameterSets;
    for (i=0; i< numOfSequenceParameterSets; i++) {
      unsigned int(16) sequenceParameterSetLength ;
      bit(8*sequenceParameterSetLength) sequenceParameterSetNALUnit;
    }
    unsigned int(8) numOfPictureParameterSets;
    for (i=0; i< numOfPictureParameterSets; i++) {
      unsigned int(16) pictureParameterSetLength;
      bit(8*pictureParameterSetLength) pictureParameterSetNALUnit;
    }
  }
  */
  avcC: {
    container: 'avc1',
    mandatory: false,
    quantity: 'one',
    box: 'Box',
    is_container: false,
    body: [
      ['configurationVersion', UInt8, 1],
      ['AVCProfileIndication', UInt8, 0x4d],
      ['profile_compatibility', UInt8, 0x00],
      ['AVCLevelIndication', UInt8, 0x29],
      // size = reserved 0b111111 + 0b11 NALUnitLength (0b11 = 4-byte)
      ['lengthSizeMinusOne', UInt8, 0b11111111],
      // Example SPS (length 20):
      //   [0x67, 0x4d, 0x00, 0x29, 0xe2, 0x90, 0x0f, 0x00,
      //    0x44, 0xfc, 0xb8, 0x0b, 0x70, 0x10, 0x10, 0x1a,
      //    0x41, 0xe2, 0x44, 0x54]
      // number of sets = reserved 0b111 + number of SPS (0b00001 = 1)
      // ['numOfSequenceParameterSets', UInt8, 0b11100001],
      // ['sequenceParameterSetLength', UInt16BE, 0], // Lenght in bytes of the SPS that follows
      // ['sequenceParameterSetNALUnit', UInt8Array, []],
      // These are packed in a single custom element:
      ['sequenceParameterSets', createParameterSetArrayClass(0xe0), []],
      // Example PPS (length 4):
      //   [0x68, 0xee, 0x3c, 0x80]
      // ['numOfPictureParameterSets', UInt8, 1], // number of PPS
      // ['pictureParameterSetLength', UInt16BE, 0], // Length in bytes of the PPS that follows
      // ['pictureParameterSetNALUnit', UInt8Array, []]
      // These are packed in a single custom element:
      ['pictureParameterSets', createParameterSetArrayClass(), []],
    ],
  },
  /*
  ISO/IEC 14496-12:2005(E) 8.16.2 (pp. 28)
  aligned(8) abstract class SampleEntry (unsigned int(32) format)
    extends Box(format){
    const unsigned int(8)[6] reserved = 0;
    unsigned int(16) data_reference_index;
  }
  class AudioSampleEntry(codingname) extends SampleEntry (codingname){
    const unsigned int(32)[2] reserved = 0;
    template unsigned int(16) channelcount = 2;
    template unsigned int(16) samplesize = 16;
    unsigned int(16) pre_defined = 0;
    const unsigned int(16) reserved = 0 ;
    template unsigned int(32) samplerate = {timescale of media}<<16;
  }
  */
  mp4a: {
    container: 'stsd',
    mandatory: false,
    quantity: 'one',
    box: 'Box',
    is_container: true,
    body: [
      ['reserved', Empty, 6],
      ['data_reference_index', UInt16BE, 1],
      ['reserved2', UInt32BEArray, [0, 0]],
      ['channelcount', UInt16BE, 2],
      ['samplesize', UInt16BE, 16],
      ['pre_defined', UInt16BE, 0],
      ['reserved3', UInt16BE, 0],
      ['samplerate', UInt32BE, 0], // 16.16 bit floating point
    ],
  },
  /* Elementary stream descriptor
  basic box that holds only an ESDescriptor
  reference: 'https://developer.apple.com/library/content/documentation/QuickTime/QTFF/QTFFChap3/qtff3.html#//apple_ref/doc/uid/TP40000939-CH205-124774'
  Descriptors have a tag that identifies them, specified in ISO/IEC 14496-1 8.3.12
  ISO/IEC 14496-1 8.3.3 (pp. 24) ES_Descriptor
  aligned(8) class ES_Descriptor : bit(8) tag=ES_DescrTag {
    bit(8) length;
    bit(16) ES_ID;
    bit(1) streamDependenceFlag;
    bit(1) URL_Flag;
    const bit(1) reserved=1;
    bit(5) streamPriority;
    if (streamDependenceFlag)
      bit(16) dependsOn_ES_ID;
    if (URL_Flag)
      bit(8) URLstring[length-3-(streamDependencFlag*2)];
    ExtensionDescriptor extDescr[0 .. 255];
    LanguageDescriptor langDescr[0 .. 1];
    DecoderConfigDescriptor decConfigDescr;
    SLConfigDescriptor slConfigDescr;
    IPI_DescPointer ipiPtr[0 .. 1];
    IP_IdentificationDataSet ipIDS[0 .. 1];
    QoS_Descriptor qosDescr[0 .. 1];
  }
  aligned(8) class DecoderConfigDescriptor
    : bit(8) tag=DecoderConfigDescrTag {
    bit(8) length;
    bit(8) objectProfileIndication;
    bit(6) streamType;
    bit(1) upStream;
    const bit(1) reserved=1;
    bit(24) bufferSizeDB;
    bit(32) maxBitrate;
    bit(32) avgBitrate;
    DecoderSpecificInfo decSpecificInfo[];
  }
  aligned(8) class DecoderSpecificInfoShort extends DecoderSpecificInfo
  : bit(8) tag=DecSpecificInfoShortTag
  {
    bit(8) length;
    bit(8) specificInfo[length];
  }
  aligned(8) class SLConfigDescriptor : bit(8) tag=SLConfigDescrTag {
    bit(8) length;
    bit(8) predefined;
    if (predefined==0) {
      bit(1) useAccessUnitStartFlag;
      bit(1) useAccessUnitEndFlag;
      bit(1) useRandomAccessPointFlag;
      bit(1) usePaddingFlag;
      bit(1) useTimeStampsFlag;
      bit(1) useWallClockTimeStampFlag;
      bit(1) useIdleFlag;
      bit(1) durationFlag;
      bit(32) timeStampResolution;
      bit(32) OCRResolution;
      bit(8) timeStampLength; // must be less than 64
      bit(8) OCRLength;
      // must be less than 64
      bit(8) AU_Length;
      // must be less than 32
      bit(8) instantBitrateLength;
      bit(4) degradationPriorityLength;
      bit(4) seqNumLength;
      if (durationFlag) {
        bit(32) timeScale;
        bit(16) accessUnitDuration;
        bit(16) compositionUnitDuration;
      }
      if (!useTimeStampsFlag) {
        if (useWallClockTimeStampFlag)
          double(64) wallClockTimeStamp;
        bit(timeStampLength) startDecodingTimeStamp;
        bit(timeStampLength) startCompositionTimeStamp;
      }
    }
    aligned(8) bit(1) OCRstreamFlag;
    const bit(7) reserved=0b1111.111;
    if (OCRstreamFlag)
      bit(16) OCR_ES_Id;
  }
  */
  esds: {
    container: 'mp4a',
    mandatory: false,
    quantity: 'one',
    box: 'FullBox',
    is_container: false,
    body: [
      ['ES_DescrTag', UInt8, 3],
      // length of the remainder of this descriptor in byte,
      // excluding trailing embedded descriptors.
      ['ES_DescrLength', UInt8, 25],
      ['ES_ID', UInt16BE, 1],
      ['flagsAndStreamPriority', UInt8, 0],
      ['DecoderConfigDescrTag', UInt8, 4],
      // length of the remainder of this descriptor in bytes,
      // excluding trailing embedded descriptors.
      ['DecoderConfigDescrLength', UInt8, 15],
      ['objectProfileIndication', UInt8, 0x40],
      ['streamTypeUpstreamReserved', UInt8, 0x15],
      ['bufferSizeDB', UInt8Array, [0, 0, 0]],
      ['maxBitRate', UInt32BE, 0],
      ['avgBitRate', UInt32BE, 0],
      ['DecSpecificInfoShortTag', UInt8, 5],
      ['DecSpecificInfoShortLength', UInt8, 0],
      ['audioConfigBytes', UInt8Array, []],
      ['SLConfigDescrTag', UInt8, 6],
      ['SLConfigDescrLength', UInt8, 1],
      ['SLConfigDescrPredefined', UInt8, 0x02], // ISO use
    ],
  },
  // Sample Size Box
  stsz: {
    container: 'stbl',
    mandatory: true,
    quantity: 'one',
    box: 'FullBox',
    is_container: false,
    body: [
      ['sample_size', UInt32BE, 0],
      ['sample_count', UInt32BE, 0],
      // For each sample up to sample_count, append an entry_size:
      // ['entry_size', UInt32BE, ],
    ],
  },
  // Sample To Chunk Box
  stsc: {
    container: 'stbl',
    mandatory: true,
    quantity: 'one',
    box: 'FullBox',
    is_container: false,
    body: [
      ['entry_count', UInt32BE, 0],
      // For each entry up to entry_count, append these elements:
      // ['first_chunk', UInt32BE, ],
      // ['samples_per_chunk', UInt32BE, ],
      // ['samples_description_index', UInt32BE, ],
    ],
  },
  // Chunk Offset Box
  stco: {
    container: 'stbl',
    mandatory: true,
    quantity: 'one',
    box: 'FullBox',
    is_container: false,
    body: [
      ['entry_count', UInt32BE, 0],
      // For each entry up to entry_count, append an element:
      // ['chunk_offset', UInt32BE, ],
    ],
  },
  // Sync Sample Box
  stss: {
    container: 'stbl',
    mandatory: false,
    quantity: 'one-',
    box: 'FullBox',
    is_container: false,
    body: [
      ['entry_count', UInt32BE, 0],
      // For each entry up to entry_count, append an element:
      // ['sample_number', UInt32BE, ],
    ],
  },
  // Edit Box
  edts: {
    container: 'trak',
    mandatory: false,
    quantity: 'one-',
    box: 'Box',
    is_container: true,
  },
  // Edit List Box
  elst: {
    container: 'edts',
    mandatory: false,
    quantity: 'one-',
    box: 'FullBox',
    is_container: false,
    body: [
      ['entry_count', UInt32BE, 1],
      ['segment_duration', UInt32BE, 0],
      ['media_time', UInt32BE, 0xffffffff],
      ['media_rate_integer', UInt16BE, 1],
      ['media_rate_fraction', UInt16BE, 0],
    ],
  },
  mvex: {
    container: 'moov',
    mandatory: false,
    quantity: 'one-',
    box: 'Box',
    is_container: true,
  },
  mehd: {
    container: 'mvex',
    mandatory: false,
    quantity: 'one-',
    box: 'FullBox',
    is_container: false,
    body: [
      ['fragment_duration', UInt32BE, 0], // Total duration of movie
    ],
  },
  trex: {
    container: 'mvex',
    mandatory: true,
    quantity: 'one+',
    box: 'FullBox',
    is_container: false,
    body: [
      ['track_ID', UInt32BE, 1], // The track to which this data is applicable
      ['default_sample_description_index', UInt32BE, 1],
      ['default_sample_duration', UInt32BE, 0],
      ['default_sample_size', UInt32BE, 0],
      ['default_sample_flags', UInt32BE, 0],
    ],
  },
  moof: {
    container: 'file',
    mandatory: false,
    quantity: 'zero+',
    box: 'Box',
    is_container: false,
  },
  mfhd: {
    container: 'moof',
    mandatory: true,
    quantity: 'one',
    box: 'FullBox',
    is_container: false,
    body: [
      ['sequence_number', UInt32BE, 0], // A number associated with this fragment
    ],
  },
  traf: {
    container: 'moof',
    mandatory: false,
    quantity: 'zero+',
    box: 'Box',
    is_container: true,
  },
  tfhd: {
    container: 'traf',
    mandatory: true,
    quantity: 'one',
    box: 'FullBox',
    is_container: false,
    // Flag values for the track fragment header:
    // 0x000001 base-data-offset-present
    // 0x000002 sample-description-index-present
    // 0x000008 default-sample-duration-present
    // 0x000010 default-sample-size-present
    // 0x000020 default-sample-flags-present
    // 0x010000 duration-is-empty
    // 0x020000 default-base-is-moof
    config: {
      flags: 0x000020, // default sample flags present
    },
    body: [
      ['track_ID', UInt32BE, 1], // The track to which this data is applicable
      // ['base_data_offset', UInt64BE, 0],
      // ['default_sample_description_index', UInt32BE, 0],
      // ['default_sample_duration', UInt32BE, 0],
      // ['default_sample_size', UInt32BE, 0],
      ['default_sample_flags', UInt32BE, 0],
    ],
  },
  tfdt: {
    container: 'traf',
    mandatory: false,
    quantity: 'one-',
    box: 'FullBox',
    is_container: false,
    config: {
      version: 1, // Version 1 uses 64-bit value for baseMediaDecodeTime
    },
    body: [['baseMediaDecodeTime', UInt64BE, 0]],
  },
  trun: {
    container: 'traf',
    mandatory: false,
    quantity: 'zero+',
    box: 'FullBox',
    is_container: false,
    // Flag values for the track fragment header:
    // 0x000001 data-offset-present
    // 0x000004 first-sample-flags-present
    // 0x000100 sample-duration-present
    // 0x000200 sample-size-present
    // 0x000400 sample-flags-present
    // 0x000800 sample-composition-time-offsets-present
    config: {
      flags: 0x000305, // default sample flags present
    },
    body: [
      ['sample_count', UInt32BE, 1], // How many samples there are
      ['data_offset', UInt32BE, 0],
      ['first_sample_flags', UInt32BE, 0],
      ['sample_duration', UInt32BE, 0],
      ['sample_size', UInt32BE, 0],
      // ['sample_flags', UInt32BE, 0],
      // ['sample_composition_time_offset', UInt32BE, 0],
    ],
  },
  // Unknown Box, used for parsing
  '....': {
    box: 'Box',
    is_container: false,
    body: [],
  },
  // File Box, special box without any headers
  file: {
    box: 'None',
    is_container: true,
    mandatory: true,
    quantity: 'one',
  },
}

/**
 * Helper functions to generate some standard elements that are needed by
 * all types of boxes.
 * All boxes have a length and type, where so-called full boxes have an
 * additional 4-bytes (1-byte version and 3-byte flags fields).
 */
class Header {
  static None() {
    return []
  }

  static Box(type: string) {
    return [
      ['size', UInt32BE, 0],
      ['type', CharArray, type],
    ]
  }

  static FullBox(type: string) {
    return ([] as any).concat(this.Box(type), [
      ['version', UInt8, 0x00],
      ['flags', UInt24BE, 0x000000],
    ])
  }
}

/**
 * Box class.
 *
 * Defines a box as an entity similar to a C struct, where the struct is
 * represented by a Map of elements.
 * Each element is an object with at least:
 *  - a 'byteLength' property (size of element in bytes)
 *  - a 'copy' method (BufferMutation signature)
 */
export class Box extends BoxElement {
  public type: string
  public config: { [key: string]: any }
  public struct: Map<
    string,
    {
      offset: number
      element: {
        value?: any
        byteLength: number
        copy: BufferMutation
        load?: BufferMutation
        format?: (indent?: number) => string
      }
    }
  >

  /**
   * Create a new Box.
   * @param  type   4-character ASCII string
   * @param  config Configuration holding (key: value) fields
   */
  constructor(type: string, config?: { [key: string]: any }) {
    super(0)
    this.type = type
    const spec = BOXSPEC[this.type]
    if (spec === undefined) {
      throw new Error(`unknown box type: ${type}`)
    }
    this.config = Object.assign({}, spec.config, config)
    const header = Header[spec.box](this.type)
    const body = spec.body || []
    // Uglify changes the name of the original class, so this doesn't work.
    // TODO: find a better way to check for this.
    // if (spec.body === undefined && this.constructor.name !== 'Container') {
    //   throw new Error(`Body missing but '${type}' is not a container box`);
    // }

    // Initialize all elements, an element is something with a byteLength
    this.struct = new Map()
    let offset = 0
    for (const [key, Type, defaultValue] of ([] as any).concat(header, body)) {
      if (this.has(key)) {
        throw new Error('Trying to add existing key')
      }
      let value = defaultValue
      if (this.config[key]) {
        value = this.config[key]
      }
      const element = new Type(value)
      this.struct.set(key, { offset, element })
      offset += element.byteLength
    }

    this.byteLength = offset
  }

  /**
   * Get access to an element based on it's name.
   * @param  key The element's name
   * @return Object with 'byteLength' property and 'copy' method
   */
  element(key: string) {
    const value = this.struct.get(key)
    if (value === undefined) {
      throw new Error('invalid key')
    }
    return value.element
  }

  /**
   * Set an element's value.
   * @param  key The element's name
   * @param  value The element's (new) value
   */
  set(key: string, value: any) {
    this.element(key).value = value
  }

  /**
   * Get an element's value.
   * @param  key The element's name
   * @return The element's value
   */
  get(key: string) {
    return this.element(key).value
  }

  /**
   * Get an element's offset.
   * @param  key The element's name
   * @return The element's offset
   */
  offset(key: string) {
    const value = this.struct.get(key)
    if (value === undefined) {
      throw new Error('invalid key')
    }
    return value.offset
  }

  /**
   * Check if a certain element exists
   * @param  key The element's name
   * @return true if the element is known, false if not
   */
  has(key: string) {
    return this.struct.has(key)
  }

  /**
   * Add a new element to the box.
   * @param key     A _new_ non-existing element name.
   * @param element Something with a 'byteLength' property and 'copy' method.
   * @return this box, so that 'add' can be used in a chain
   */
  add(key: string, element: BoxElement) {
    if (this.has(key)) {
      throw new Error('Trying to add existing key')
    }
    this.struct.set(key, { offset: this.byteLength, element })
    this.byteLength += element.byteLength
    return this
  }

  /**
   * Create a buffer and copy all element values to it.
   * @return Data representing the box.
   */
  buffer() {
    const buffer = new Uint8Array(this.byteLength)
    this.copy(buffer)
    return buffer
  }

  /**
   * Copy all values of the box into an existing buffer.
   * @param  buffer     The target buffer to accept the box data
   * @param  [offset=0] The number of bytes into the target to start at.
   */
  copy(buffer: Uint8Array, offset = 0) {
    // Before writing, make sure the size property is set correctly.
    this.set('size', this.byteLength)
    for (const entry of this.struct.values()) {
      entry.element.copy(buffer, offset + entry.offset)
    }
  }

  /**
   * Read element values from a box's data representation.
   * @param  buffer     The source buffer with box data
   * @param  [offset=0] The number of bytes into the source to start at.
   */
  load(buffer: Uint8Array, offset = 0) {
    for (const entry of this.struct.values()) {
      if (entry.element.load !== undefined) {
        entry.element.load(buffer, offset + entry.offset)
      }
    }
  }

  /**
   * Pretty-format an entire box as an element/box hierarchy.
   * @param  [indent=0] How large an indentation to use for the hierarchy
   */
  format(indent = 0) {
    const lines = [`${' '.repeat(indent)}[${this.type}] (${this.byteLength})`]
    for (const [key, entry] of this.struct) {
      const element = entry.element
      if (element.format !== undefined) {
        lines.push(element.format(indent + 2))
      } else {
        lines.push(
          `${' '.repeat(indent + 2)}${key} = ${element.value} (${
            element.byteLength
          })`
        )
      }
    }
    return lines.join('\n')
  }

  /**
   * Pretty-print an entire box as an element/box hierarchy.
   * @param  [indent=0] How large an indentation to use for the hierarchy
   */
  print(indent: number) {
    console.warn(this.format(indent))
  }
}

/**
 * Container class
 *
 * special box with an 'add' method which allows appending of other boxes,
 * and a 'parse' method to extract contained boxes.
 */
export class Container extends Box {
  public boxSize: number
  /**
   * Create a new container box
   * @param  type   4-character ASCII string
   * @param  config Configuration holding (key: value) fields
   * @param  boxes  One or more boxes to append.
   */
  constructor(type: string, config?: { [key: string]: any }, ...boxes: Box[]) {
    super(type, config)
    this.boxSize = 0
    this.append(...boxes)
  }

  /**
   * Add one or more boxes to the container.
   * @param boxes The box(es) to append
   * @return this container, so that add can be used in a chain
   */
  append(...boxes: Box[]) {
    for (const box of boxes) {
      this.add(`box_${this.boxSize++}`, box)
    }
    return this
  }

  /**
   * Parse a container box by looking for boxes that it contains, and
   * recursively proceed when it is another container.
   *
   * FIXME: this cannot properly handle different versions of the FullBox,
   * currenlty the loader is hardcoded to the version used in this file.
   * Also, appearance of an esds box is assumed to be AAC audio information,
   * while the avcC box signals H.264 video information.
   *
   * @param  data The data to parse.
   */
  parse(data: Uint8Array) {
    const tracks: MediaTrack[] = []
    while (data.byteLength > 0) {
      const type = new CharArray('....')
      type.load(data, 4)
      const boxType = type.value
      const spec = BOXSPEC[boxType]
      let box
      if (spec !== undefined) {
        if (spec.is_container) {
          box = new Container(boxType)
          box.load(data)
          const boxTracks = box.parse(
            data.slice(box.byteLength, box.get('size'))
          )
          tracks.push(...boxTracks)
        } else {
          box = new Box(boxType)
          box.load(data)
          // Handle 2 kinds of tracks with streaming MP4: video or audio
          if (boxType === 'avcC') {
            const profile = box
              .element('AVCProfileIndication')
              .value.toString(16)
              .padStart(2, 0)
            const compat = box
              .element('profile_compatibility')
              .value.toString(16)
              .padStart(2, 0)
            const level = box
              .element('AVCLevelIndication')
              .value.toString(16)
              .padStart(2, 0)
            tracks.push({
              type: 'video',
              codec: `avc1.${profile}${compat}${level}`,
            })
          } else if (boxType === 'esds') {
            const audioConfigBytes = box.element('audioConfigBytes').value
            // FIXME: use external helper to extract
            const objectTypeIndication = audioConfigBytes[0] >>> 3
            tracks.push({
              type: 'audio',
              codec: `mp4a.40.${objectTypeIndication}`,
            })
          }
        }
      } else {
        box = new Box('....')
        box.load(data)
        box.type = box.get('type')
      }
      this.append(box)
      data = data.slice(box.get('size'))
    }
    return tracks
  }
}
