//----------------------------
// SIDX
//----------------------------
var SIDX = (function SIDX() {

    function parseSidx(data, byteOffset) {
        if(!data){
            return undefined;
        }
        var d = new DataView(data),
            sidx = new DashSidx(),
            pos = 0,
            offset,
            time,
            sidxEnd,
            i,
            ref_type,
            ref_size,
            ref_dur,
            type,
            size,
            mediaRange,
            startRange,
            duration,
            endRange,
            charCode;

        while (type !== "sidx" && pos < d.byteLength) {
            size = d.getUint32(pos); // subtract 8 for including the size and type
            pos += 4;

            type = "";
            for (i = 0; i < 4; i += 1) {
                charCode = d.getInt8(pos);
                type += String.fromCharCode(charCode);
                pos += 1;
            }

            if (type !== "moof" && type !== "traf" && type !== "sidx") {
                pos += size - 8;
            } else if (type === "sidx") {
                // reset the position to the beginning of the box...
                // if we do not reset the position, the evaluation
                // of sidxEnd to ab.byteLength will fail.
                pos -= 8;
            }
        }

        sidxEnd = d.getUint32(pos, false) + pos;
        if (sidxEnd > data.byteLength) {
            throw "sidx terminates after array buffer";
            return null;
        }

        sidx.version = d.getUint8(pos + 8);
        pos += 12;

        // skipped reference_ID(32)
        sidx.timescale = d.getUint32(pos + 4, false);
        pos += 8;

        if (sidx.version === 0) {
            sidx.earliestPresentationTime = d.getUint32(pos, false);
            sidx.firstOffset = d.getUint32(pos + 4, false);
            pos += 8;
        } else {
            // TODO(strobe): Overflow checks
            sidx.earliestPresentationTime = MathUtil.to64BitNumber(d.getUint32(pos + 4, false), d.getUint32(pos, false));
            //first_offset = utils.Math.to64BitNumber(d.getUint32(pos + 8, false), d.getUint32(pos + 12, false));
            sidx.firstOffset = (d.getUint32(pos + 8, false) << 32) + d.getUint32(pos + 12, false);
            pos += 16;
        }

        sidx.firstOffset += sidxEnd + (byteOffset || 0);

        // skipped reserved(16)
        sidx.referenceCount = d.getUint16(pos + 2, false);
        pos += 4;

        sidx.references = [];
        offset = sidx.firstOffset;
        time = sidx.earliestPresentationTime;
        console.log('\t reference count:', sidx.referenceCount);
        for (i = 0; i < sidx.referenceCount; i += 1) {
            ref_size = d.getUint32(pos, false);
            ref_type = (ref_size >>> 31);
            ref_size = ref_size & 0x7fffffff;
            ref_dur = d.getUint32(pos + 4, false);
            endRange = (offset + ref_size - 1);
            startRange = offset;
            mediaRange = startRange + '-' + endRange;
            pos += 12;
            sidx.references.push(
                new DashSidxReference(ref_size, ref_type, offset, ref_dur, time, sidx.timescale, mediaRange, startRange, endRange, ref_dur / sidx.timescale, time / sidx.timescale)
            );
            offset += ref_size;
            time += ref_dur;
        }

        if (pos !== sidxEnd) {
            throw "Error: final pos " + pos + " differs from SIDX end " + sidxEnd;
            return null;
        }

        return sidx;

    }

    function DashSidxReference(size, type, offset, duration, time, timescale, mediaRange, startRange, endRange, durationSec, startTimeSec) {
        this.size = size;
        this.type = type;
        this.offset = offset;
        this.duration = duration;
        this.time = time;
        this.timescale = timescale;
        this.mediaRange = mediaRange;
        this.startRange = startRange;
        this.endRange = endRange;
        this.durationSec = durationSec;
        this.startTimeSec = startTimeSec;
    }

    function DashSidx() {
        var version = undefined;
        var timescale = undefined;
        var earliestPresentationTime = undefined;
        var firstOffset = undefined;
        var referenceCount = undefined;
        var references = DashSidxReference;
        return {
            version: version,
            timescale: timescale,
            earliestPresentationTime: earliestPresentationTime,
            firstOffset: firstOffset,
            referenceCount: referenceCount,
            references: references
        }
    }

    return {
        parseSidx: parseSidx
    }
})();

module.exports = SIDX;